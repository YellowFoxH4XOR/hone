// The OpenCode adapter, driven the way OpenCode drives it: instantiate the
// plugin, then call its hooks with mock input/output objects and assert the
// same behavior the Claude Code hooks produce. State goes to a temp dir via
// HONE_STATE_DIR (the same override the e2e hook tests use).

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HonePlugin } from '../opencode/plugin/hone.ts';
import type { Part } from '../opencode/plugin/opencode-types.ts';
import type { SessionState, Profile } from '../lib/types.ts';

const SID = 'oc-test-session';
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-oc-'));
  process.env.HONE_STATE_DIR = tmpDir;
});
afterEach(() => {
  delete process.env.HONE_STATE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function textParts(prompt: string): Part[] {
  return [{ type: 'text', text: prompt }];
}
function injected(parts: Part[]): string {
  return parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('\n');
}
function sessionFile(): SessionState {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, 'sessions', `${SID}.json`), 'utf8'));
}
function profileFile(): Profile {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, 'profile.json'), 'utf8'));
}

test('chat.message opens the Solution Gate and injects gate context for a learning task', async () => {
  const hooks = await HonePlugin({ directory: tmpDir });
  const parts = textParts('we keep hitting a race condition when two workers claim the same job');
  await hooks['chat.message']!({ sessionID: SID }, { message: {}, parts });
  const ctx = injected(parts);
  assert.ok(ctx.includes('Solution Gate is ACTIVE'), 'gate context injected');
  assert.strictEqual(sessionFile().gate, 'pending', 'gate is pending');
});

test('tool.execute.before throws (deny) while the gate is pending, but allows reads', async () => {
  const hooks = await HonePlugin({ directory: tmpDir });
  await hooks['chat.message']!(
    { sessionID: SID },
    { message: {}, parts: textParts('we keep hitting a race condition when two workers claim the same job') },
  );
  assert.strictEqual(sessionFile().gate, 'pending');

  await assert.rejects(
    hooks['tool.execute.before']!({ tool: 'write', sessionID: SID, callID: 'c1' }, { args: {} }),
    /Solution Gate/,
    'write is denied while gated',
  );
  // A read-only tool is fine.
  await assert.doesNotReject(
    hooks['tool.execute.before']!({ tool: 'read', sessionID: SID, callID: 'c2' }, { args: {} }),
  );
  // A file-writing bash command is denied; the hone-ctl escape hatch is not.
  await assert.rejects(
    hooks['tool.execute.before']!(
      { tool: 'bash', sessionID: SID, callID: 'c3' },
      { args: { command: 'echo x > file.ts' } },
    ),
    /Solution Gate/,
  );
  await assert.doesNotReject(
    hooks['tool.execute.before']!(
      { tool: 'bash', sessionID: SID, callID: 'c4' },
      { args: { command: 'hone-ctl skip' } },
    ),
  );
});

test('a substantive gate answer opens the gate and records an independent rep', async () => {
  const hooks = await HonePlugin({ directory: tmpDir });
  await hooks['chat.message']!(
    { sessionID: SID },
    { message: {}, parts: textParts('we keep hitting a race condition when two workers claim the same job') },
  );
  const answer = textParts('use row-level locking with SELECT FOR UPDATE SKIP LOCKED');
  await hooks['chat.message']!({ sessionID: SID }, { message: {}, parts: answer });

  assert.ok(injected(answer).includes('Gate is now open'), 'coaching context injected after answer');
  assert.strictEqual(sessionFile().gate, 'answered');
  const p = profileFile();
  assert.strictEqual(p.skills['concurrency']?.independent_reps, 1);
  assert.strictEqual(p.counters.gates_answered, 1);
});

test('tool.execute.after appends a senior-lens review after a coached write', async () => {
  const hooks = await HonePlugin({ directory: tmpDir });
  await hooks['chat.message']!(
    { sessionID: SID },
    { message: {}, parts: textParts('we keep hitting a race condition when two workers claim the same job') },
  );
  await hooks['chat.message']!(
    { sessionID: SID },
    { message: {}, parts: textParts('row-level locking with SELECT FOR UPDATE SKIP LOCKED') },
  );
  const out = { title: 't', output: 'wrote worker.ts', metadata: {} };
  await hooks['tool.execute.after']!({ tool: 'write', sessionID: SID, callID: 'c1', args: {} }, out);
  assert.ok(out.output.includes('senior-lens review'), 'feedback appended to tool output');
  // Once per task only.
  const out2 = { title: 't', output: 'edited worker.ts', metadata: {} };
  await hooks['tool.execute.after']!({ tool: 'edit', sessionID: SID, callID: 'c2', args: {} }, out2);
  assert.ok(!out2.output.includes('senior-lens review'), 'auto-feedback is once per task');
});

test('event session.idle queues a reflection after coached work', async () => {
  const hooks = await HonePlugin({ directory: tmpDir });
  await hooks['chat.message']!(
    { sessionID: SID },
    { message: {}, parts: textParts('we keep hitting a race condition when two workers claim the same job') },
  );
  await hooks['chat.message']!(
    { sessionID: SID },
    { message: {}, parts: textParts('row-level locking, that is my plan here') },
  );
  await hooks.event!({ event: { type: 'session.idle', properties: { sessionID: SID } } });
  assert.strictEqual(profileFile().pending_reflection?.category, 'concurrency');
  // The next session surfaces it via the first chat.message.
  const next = textParts('add a logout button to the navbar');
  await hooks['chat.message']!({ sessionID: 'oc-next' }, { message: {}, parts: next });
  assert.ok(injected(next).includes('<hone-reflection>'), 'deferred reflection surfaced next session');
});

test('an execution task passes through: no gate, no coaching block', async () => {
  const hooks = await HonePlugin({ directory: tmpDir });
  // Pre-mark the session started so we isolate the passthrough (no first-message
  // status line noise).
  fs.mkdirSync(path.join(tmpDir, 'sessions'), { recursive: true });
  const base = { gate: 'idle', category: null, task_preview: null, opened_at: null, updated_at: null, coached_count: 0, started: true };
  fs.writeFileSync(path.join(tmpDir, 'sessions', `${SID}.json`), JSON.stringify(base));

  const parts = textParts('add a logout button to the navbar component');
  await hooks['chat.message']!({ sessionID: SID }, { message: {}, parts });
  assert.ok(!injected(parts).includes('<hone-coaching>'), 'no coaching injected for execution task');
  assert.strictEqual(sessionFile().gate, 'idle', 'no gate opened');
});

test('a thrown state error in tool.execute.before fails open (only Hone denials propagate)', async () => {
  const hooks = await HonePlugin({ directory: tmpDir });
  // No gate pending -> even a write tool is allowed (fails open / no opinion).
  await assert.doesNotReject(
    hooks['tool.execute.before']!({ tool: 'write', sessionID: SID, callID: 'c1' }, { args: {} }),
  );
});
