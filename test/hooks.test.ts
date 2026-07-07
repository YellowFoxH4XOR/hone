// End-to-end: drives the real hook scripts as child processes, the way
// Claude Code does — JSON on stdin, JSON (or nothing) on stdout. The hooks
// are .ts files executed directly by Node's native type stripping.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SessionState, Profile } from '../lib/types.ts';

const ROOT = path.join(import.meta.dirname, '..');
const SESSION = 'e2e-test-session';
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-e2e-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runHook(script: string, input: unknown): any {
  const out = execFileSync('node', [path.join(ROOT, 'hooks', script)], {
    input: JSON.stringify(input),
    env: { ...process.env, HONE_STATE_DIR: tmpDir },
    encoding: 'utf8',
    timeout: 10_000,
  });
  return out.trim() === '' ? null : JSON.parse(out);
}

function runCtl(args: string[]): string {
  return execFileSync('node', [path.join(ROOT, 'bin', 'hone-ctl.ts'), ...args], {
    env: { ...process.env, HONE_STATE_DIR: tmpDir },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

function sessionFile(): SessionState {
  return JSON.parse(
    fs.readFileSync(path.join(tmpDir, 'sessions', `${SESSION}.json`), 'utf8'),
  ) as SessionState;
}

function profileFile(): Profile {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, 'profile.json'), 'utf8')) as Profile;
}

test('full coached-task lifecycle through the real hooks', () => {
  // 1. SessionStart: first-run setup + status context.
  const start = runHook('session-start.ts', { session_id: SESSION, source: 'startup', cwd: tmpDir });
  assert.ok(start.hookSpecificOutput.additionalContext.includes('Hone is active'));
  assert.ok(fs.existsSync(path.join(tmpDir, 'config.yaml')), 'default config written on first run');

  // 2. A learning prompt in a pinned category (concurrency) coaches immediately.
  const coached = runHook('user-prompt-submit.ts', {
    session_id: SESSION,
    cwd: tmpDir,
    prompt: 'we keep hitting a race condition when two workers claim the same job',
  });
  assert.ok(coached.hookSpecificOutput.additionalContext.includes('Solution Gate is ACTIVE'));
  assert.strictEqual(sessionFile().gate, 'pending');

  // 3. While pending: Write is denied, read-only Bash is allowed, writing Bash is denied.
  const denyWrite = runHook('pre-tool-use.ts', {
    session_id: SESSION, cwd: tmpDir,
    tool_name: 'Write',
    tool_input: { file_path: '/x.js', content: 'x' },
  });
  assert.strictEqual(denyWrite.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(denyWrite.hookSpecificOutput.permissionDecisionReason.includes('/hone:skip'));

  const allowRead = runHook('pre-tool-use.ts', {
    session_id: SESSION, cwd: tmpDir,
    tool_name: 'Bash',
    tool_input: { command: 'grep -rn "claimJob" src/ 2>&1 | head -20' },
  });
  assert.strictEqual(allowRead, null, 'stderr-merge redirects must not trip the gate');

  const denyBash = runHook('pre-tool-use.ts', {
    session_id: SESSION, cwd: tmpDir,
    tool_name: 'Bash',
    tool_input: { command: 'echo "fixed" > src/worker.js' },
  });
  assert.strictEqual(denyBash.hookSpecificOutput.permissionDecision, 'deny');

  const allowCtl = runHook('pre-tool-use.ts', {
    session_id: SESSION, cwd: tmpDir,
    tool_name: 'Bash',
    tool_input: { command: 'node "/anywhere/bin/hone-ctl.ts" skip' },
  });
  assert.strictEqual(allowCtl, null, 'the skip escape hatch must never be blocked');

  // 4. The user answers; the gate opens and coaching instructions arrive.
  const answered = runHook('user-prompt-submit.ts', {
    session_id: SESSION, cwd: tmpDir,
    prompt: 'i think we need row-level locking with SELECT FOR UPDATE SKIP LOCKED',
  });
  assert.ok(answered.hookSpecificOutput.additionalContext.includes('Gate is now open'));
  assert.strictEqual(sessionFile().gate, 'answered');

  // 5. Tools flow freely again.
  const allowAfter = runHook('pre-tool-use.ts', {
    session_id: SESSION, cwd: tmpDir,
    tool_name: 'Write',
    tool_input: { file_path: '/x.js', content: 'x' },
  });
  assert.strictEqual(allowAfter, null);

  // 6. Profile recorded the interaction.
  const profile = profileFile();
  assert.strictEqual(profile.counters.eligible, 1);
  assert.strictEqual(profile.counters.coached, 1);
  assert.strictEqual(profile.counters.gates_answered, 1);
  assert.strictEqual(profile.categories['concurrency']?.coached, 1);
});

test('the docs-variant user_input field is honored too', () => {
  runHook('session-start.ts', { session_id: SESSION, source: 'startup', cwd: tmpDir });
  const coached = runHook('user-prompt-submit.ts', {
    session_id: SESSION,
    cwd: tmpDir,
    user_input: 'we keep hitting a race condition when two workers claim the same job',
  });
  assert.ok(coached.hookSpecificOutput.additionalContext.includes('Solution Gate is ACTIVE'));
});

test('execution prompts pass through with zero output and zero state', () => {
  runHook('session-start.ts', { session_id: SESSION, source: 'startup', cwd: tmpDir });
  const out = runHook('user-prompt-submit.ts', {
    session_id: SESSION, cwd: tmpDir,
    prompt: 'add a logout button to the navbar component',
  });
  assert.strictEqual(out, null, 'execution tasks must be invisible');
  // Passthrough never even materializes a profile — zero writes on the hot path.
  const profilePath = path.join(tmpDir, 'profile.json');
  if (fs.existsSync(profilePath)) {
    assert.strictEqual(profileFile().counters.eligible, 0);
  }
});

test('/hone:skip unblocks a pending gate via hone-ctl', () => {
  runHook('session-start.ts', { session_id: SESSION, source: 'startup', cwd: tmpDir });
  runHook('user-prompt-submit.ts', {
    session_id: SESSION, cwd: tmpDir,
    prompt: 'we keep hitting a deadlock between the payment and refund workers',
  });
  assert.strictEqual(sessionFile().gate, 'pending');

  const out = runCtl(['skip']);
  assert.ok(out.includes('skipped'));
  assert.strictEqual(sessionFile().gate, 'skipped');

  const allow = runHook('pre-tool-use.ts', {
    session_id: SESSION, cwd: tmpDir,
    tool_name: 'Write',
    tool_input: { file_path: '/x.js', content: 'x' },
  });
  assert.strictEqual(allow, null);

  assert.strictEqual(profileFile().counters.skipped, 1);
});

test('/hone:off disables everything; /hone:on and hint changes apply', () => {
  runHook('session-start.ts', { session_id: SESSION, source: 'startup', cwd: tmpDir });
  runCtl(['off']);
  const out = runHook('user-prompt-submit.ts', {
    session_id: SESSION, cwd: tmpDir,
    prompt: 'we keep hitting a race condition when two workers claim the same job',
  });
  assert.strictEqual(out, null, 'disabled Hone must be fully invisible');

  runCtl(['on']);
  runCtl(['hint', '3']);
  const coached = runHook('user-prompt-submit.ts', {
    session_id: SESSION, cwd: tmpDir,
    prompt: 'we keep hitting a race condition when two workers claim the same job',
  });
  assert.ok(coached.hookSpecificOutput.additionalContext.includes('hint level 3'));

  const status = runCtl(['status']);
  assert.ok(status.includes('Hint level: 3'));
});

test('malformed stdin and corrupt state fail open (exit 0, no output)', () => {
  const out = execFileSync('node', [path.join(ROOT, 'hooks', 'user-prompt-submit.ts')], {
    input: 'this is not json{{{',
    env: { ...process.env, HONE_STATE_DIR: tmpDir },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.strictEqual(out.trim(), '');

  fs.mkdirSync(path.join(tmpDir, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'profile.json'), '{corrupt!!');
  fs.writeFileSync(path.join(tmpDir, 'config.yaml'), ':::\n  ::bad');
  assert.doesNotThrow(() =>
    runHook('user-prompt-submit.ts', { session_id: SESSION, cwd: tmpDir, prompt: 'hello there friend' }),
  );
});

test('PRD acceptance: added latency per prompt stays under 500ms', () => {
  runHook('session-start.ts', { session_id: SESSION, source: 'startup', cwd: tmpDir });
  const input = {
    session_id: SESSION, cwd: tmpDir,
    prompt: 'why is this endpoint returning stale data sometimes',
  };
  // Warm run then measured runs (first run pays disk cache; both must pass).
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = process.hrtime.bigint();
    runHook('user-prompt-submit.ts', input);
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  const median = times.sort((a, b) => a - b)[1]!;
  assert.ok(
    median < 500,
    `median hook latency ${median.toFixed(0)}ms exceeds 500ms budget (runs: ${times.map((t) => t.toFixed(0)).join(', ')}ms)`,
  );
});
