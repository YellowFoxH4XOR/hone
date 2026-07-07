import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as configLib from '../lib/config.ts';

// config.ts holds no module-level state — it re-reads HONE_STATE_DIR on every
// call — so a plain import plus env swapping per test is safe.

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-test-'));
  process.env.HONE_STATE_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.HONE_STATE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('defaults apply when no config file exists (assertive: 100% budget, hint 0, reflection on)', () => {
  const cfg = configLib.loadConfig({});
  assert.strictEqual(cfg.hone.enabled, true);
  assert.strictEqual(cfg.hone.learning_budget, 100);
  assert.strictEqual(cfg.hone.hint_level, 0);
  assert.strictEqual(cfg.hone.reflection, 'on');
  assert.deepStrictEqual(cfg.__errors, []);
});

test('user config.yaml overrides defaults, unspecified keys keep defaults', () => {
  fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'hone:\n  learning_budget: 50\n');
  const cfg = configLib.loadConfig({});
  assert.strictEqual(cfg.hone.learning_budget, 50);
  assert.strictEqual(cfg.hone.hint_level, 0); // untouched default
  assert.ok(Array.isArray(cfg.hone.categories.never_coach));
});

test('per-repo .hone.yaml overrides user config', () => {
  fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'hone:\n  learning_budget: 50\n');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-repo-'));
  fs.writeFileSync(path.join(repo, '.hone.yaml'), 'hone:\n  learning_budget: 80\n  hint_level: 3\n');
  const cfg = configLib.loadConfig({ cwd: repo });
  assert.strictEqual(cfg.hone.learning_budget, 80);
  assert.strictEqual(cfg.hone.hint_level, 3);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('regression: a null section (all children commented out) keeps defaults instead of wiping them', () => {
  fs.writeFileSync(
    path.join(tmpDir, 'config.yaml'),
    'hone:\n  learning_budget: 55\n  categories:\n    # always_coach: [architecture]\n',
  );
  const cfg = configLib.loadConfig({});
  assert.strictEqual(cfg.hone.learning_budget, 55);
  // `categories:` parsed as null must not erase the default lists.
  assert.ok(Array.isArray(cfg.hone.categories.always_coach));
  assert.ok(cfg.hone.categories.always_coach.length > 0);
});

test('malformed config records an error and falls back to defaults', () => {
  fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'hone:\n      bad: indent\n  worse: [unclosed\n');
  const cfg = configLib.loadConfig({});
  assert.strictEqual(cfg.hone.learning_budget, 100);
  assert.strictEqual(cfg.__errors?.length, 1);
});

test('runtime state overrides config; clamping applies', () => {
  const base = configLib.loadConfig({});
  const eff = configLib.effective(base, { enabled: false, hint_level: 99 });
  assert.strictEqual(eff.hone.enabled, false);
  assert.strictEqual(eff.hone.hint_level, 5);
  const eff2 = configLib.effective(base, {});
  assert.strictEqual(eff2.hone.enabled, true);
  assert.strictEqual(eff2.hone.hint_level, 0);
});

test('/hone:budget and /hone:reflection runtime overrides win over config, with clamping/validation', () => {
  const base = configLib.loadConfig({});

  const eff = configLib.effective(base, { learning_budget: 30, reflection: 'off' });
  assert.strictEqual(eff.hone.learning_budget, 30);
  assert.strictEqual(eff.hone.reflection, 'off');

  // Out-of-range / garbage runtime values fall back to the shipped default,
  // never throw, never escape unclamped.
  const outOfRange = configLib.effective(base, { learning_budget: 500 });
  assert.strictEqual(outOfRange.hone.learning_budget, 100);
  const garbageReflection = configLib.effective(base, { reflection: 'sometimes' as never });
  assert.strictEqual(garbageReflection.hone.reflection, 'on');

  // No override -> config.yaml's own values pass through untouched.
  const untouched = configLib.effective(base, {});
  assert.strictEqual(untouched.hone.learning_budget, 100);
  assert.strictEqual(untouched.hone.reflection, 'on');
});

test('clampBudget: fallback to 100 on non-finite input, clamps to [0, 100] otherwise', () => {
  assert.strictEqual(configLib.clampBudget('nonsense'), 100);
  assert.strictEqual(configLib.clampBudget(undefined), 100);
  assert.strictEqual(configLib.clampBudget(-5), 0);
  assert.strictEqual(configLib.clampBudget(250), 100);
  assert.strictEqual(configLib.clampBudget('35'), 35);
});

test('ensureDefaultConfigFile writes once and the result round-trips', () => {
  assert.strictEqual(configLib.ensureDefaultConfigFile(), true);
  assert.strictEqual(configLib.ensureDefaultConfigFile(), false); // second call no-op
  const cfg = configLib.loadConfig({});
  assert.strictEqual(cfg.hone.learning_budget, 100);
  assert.deepStrictEqual(cfg.__errors, []);
});
