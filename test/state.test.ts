import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as state from '../lib/state.ts';

// state.ts reads HONE_STATE_DIR per call (no module-level caching), so a
// plain import plus env swapping per test is safe.

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-state-'));
  process.env.HONE_STATE_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.HONE_STATE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('profile round-trips and defaults when missing or corrupt', () => {
  const fresh = state.loadProfile();
  assert.strictEqual(fresh.counters.eligible, 0);
  fresh.counters.eligible = 7;
  state.saveProfile(fresh);
  assert.strictEqual(state.loadProfile().counters.eligible, 7);

  fs.writeFileSync(path.join(tmpDir, 'profile.json'), '{corrupt json!!');
  assert.strictEqual(state.loadProfile().counters.eligible, 0); // self-heals
});

test('session state round-trips and ids are sanitized against traversal', () => {
  const evil = '../../../etc/passwd';
  const session = state.loadSession(evil);
  session.gate = 'pending';
  state.saveSession(evil, session);
  const stored = fs.readdirSync(path.join(tmpDir, 'sessions')).filter((f) => f.endsWith('.json'));
  assert.strictEqual(stored.length, 1);
  assert.ok(!stored[0]?.includes('..'));
  assert.strictEqual(state.loadSession(evil).gate, 'pending');
});

test('current-session pointer round-trips', () => {
  assert.strictEqual(state.currentSessionId(), null);
  state.touchCurrentSession('abc-123');
  assert.strictEqual(state.currentSessionId(), 'abc-123');
});

test('gcSessions removes only stale files', () => {
  state.saveSession('old', state.defaultSession());
  state.saveSession('new', state.defaultSession());
  const oldFile = state.sessionPath('old');
  const stale = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  fs.utimesSync(oldFile, stale, stale);
  const removed = state.gcSessions(7);
  assert.strictEqual(removed, 1);
  assert.ok(!fs.existsSync(oldFile));
  assert.ok(fs.existsSync(state.sessionPath('new')));
});

test('saveJson is atomic-ish: no partial tmp files left behind', () => {
  state.saveProfile(state.defaultProfile());
  const leftovers = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp'));
  assert.deepStrictEqual(leftovers, []);
});
