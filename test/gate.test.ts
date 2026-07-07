import { test } from 'node:test';
import assert from 'node:assert';
import * as gate from '../lib/gate.ts';
import { defaultSession } from '../lib/state.ts';

test('full lifecycle: idle -> pending -> answered', () => {
  const s = defaultSession();
  assert.strictEqual(gate.isBlocking(s), false);
  gate.open(s, { category: 'security', prompt: 'add jwt auth, how should tokens be stored' });
  assert.strictEqual(s.gate, 'pending');
  assert.strictEqual(gate.isBlocking(s), true);
  assert.strictEqual(s.coached_count, 1);
  assert.ok(gate.markAnswered(s));
  assert.strictEqual(s.gate, 'answered');
  assert.strictEqual(gate.isBlocking(s), false);
});

test('skip from pending reports it was pending; skip when idle reports not', () => {
  const s = defaultSession();
  gate.open(s, { category: 'concurrency', prompt: 'x' });
  assert.strictEqual(gate.skip(s), true);
  assert.strictEqual(s.gate, 'skipped');

  const idle = defaultSession();
  assert.strictEqual(gate.skip(idle), false);
  assert.strictEqual(idle.gate, 'skipped');
});

test('markAnswered is a no-op unless pending', () => {
  const s = defaultSession();
  assert.strictEqual(gate.markAnswered(s), false);
  s.gate = 'skipped';
  assert.strictEqual(gate.markAnswered(s), false);
  assert.strictEqual(s.gate, 'skipped');
});

test('a new coached task re-opens an answered gate and bumps the count', () => {
  const s = defaultSession();
  gate.open(s, { category: 'debugging', prompt: 'first' });
  gate.markAnswered(s);
  gate.open(s, { category: 'performance', prompt: 'second' });
  assert.strictEqual(s.gate, 'pending');
  assert.strictEqual(s.category, 'performance');
  assert.strictEqual(s.coached_count, 2);
});

test('task preview is truncated and never throws on odd input', () => {
  const s = defaultSession();
  gate.open(s, { category: 'x', prompt: 'a'.repeat(1000) });
  assert.strictEqual(s.task_preview?.length, 140);
  assert.doesNotThrow(() => gate.open(defaultSession(), { category: null, prompt: null }));
});

test('isBlocking and describe tolerate null/garbage sessions', () => {
  assert.strictEqual(gate.isBlocking(null), false);
  assert.strictEqual(gate.describe(null), 'idle');
  assert.strictEqual(gate.describe({ gate: 'garbage' }), 'idle');
});
