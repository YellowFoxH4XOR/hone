import { test } from 'node:test';
import assert from 'node:assert';
import { decide, normalizeBudget } from '../lib/budget.ts';
import { DEFAULTS } from '../lib/config.ts';
import type { Classification, HoneConfig, Profile } from '../lib/types.ts';

function freshProfile(): Profile {
  return {
    version: 2,
    created_at: 'test',
    counters: { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 },
    categories: {},
    skills: {},
    hint_history: [],
  };
}

function learningTask(category = 'debugging'): Classification {
  return {
    intent: 'learning',
    category,
    passthrough: false,
    scores: { learning: 2, execution: 0 },
    signals: [],
  };
}

function config(overrides: Record<string, unknown> = {}): HoneConfig {
  const base = JSON.parse(JSON.stringify(DEFAULTS)) as HoneConfig;
  base.hone = { ...base.hone, ...overrides };
  return base;
}

test('budget enforcement is exact: coached/eligible never exceeds the budget', () => {
  const profile = freshProfile();
  const cfg = config({ learning_budget: 20, categories: { always_coach: [], never_coach: [] } });
  for (let i = 0; i < 1000; i++) {
    decide({ classification: learningTask(), config: cfg, profile });
    const { coached, eligible } = profile.counters;
    assert.ok(
      coached <= 0.2 * eligible + 1e-9,
      `after ${i + 1} requests: ${coached}/${eligible} exceeds 20%`,
    );
  }
  assert.strictEqual(profile.counters.eligible, 1000);
  assert.strictEqual(profile.counters.coached, 200); // exactly 20%, deterministic
});

test('regression: no float under-coaching at exact boundaries (0.35*180 === 62.999…)', () => {
  // With budget 35%, integer math coaches exactly floor(35n/100) times by
  // request n. The old float expression denied the 180th request's coach
  // (63 <= 62.999… is false) — confirmed by adversarial review.
  const profile = freshProfile();
  const cfg = config({ learning_budget: 35, categories: { always_coach: [], never_coach: [] } });
  for (let i = 1; i <= 180; i++) {
    decide({ classification: learningTask(), config: cfg, profile });
    assert.strictEqual(
      profile.counters.coached,
      Math.floor((35 * i) / 100),
      `at eligible=${i}: coached=${profile.counters.coached}`,
    );
  }
  assert.strictEqual(profile.counters.coached, 63);
});

test('at 20%, coaching fires on the 5th, 10th, 15th eligible request', () => {
  const profile = freshProfile();
  const cfg = config({ learning_budget: 20, categories: { always_coach: [], never_coach: [] } });
  const fired: number[] = [];
  for (let i = 1; i <= 15; i++) {
    const result = decide({ classification: learningTask(), config: cfg, profile });
    if (result.coach) fired.push(i);
  }
  assert.deepStrictEqual(fired, [5, 10, 15]);
});

test('execution tasks are never eligible and never mutate counters', () => {
  const profile = freshProfile();
  const result = decide({
    classification: { ...learningTask('tests'), intent: 'execution' },
    config: config(),
    profile,
  });
  assert.strictEqual(result.coach, false);
  assert.strictEqual(result.reason, 'execution-task');
  assert.strictEqual(profile.counters.eligible, 0);
});

test('always_coach categories bypass the ratio but still count against it', () => {
  const profile = freshProfile();
  const cfg = config({ learning_budget: 20 }); // default categories pin architecture/concurrency/distributed/security
  const first = decide({ classification: learningTask('concurrency'), config: cfg, profile });
  assert.strictEqual(first.coach, true, 'pinned category coaches even on the 1st eligible request');
  assert.strictEqual(profile.counters.coached, 1);
  // The next unpinned request is now over budget (1 coached / 2 eligible > 20%).
  const second = decide({ classification: learningTask('debugging'), config: cfg, profile });
  assert.strictEqual(second.coach, false);
  assert.strictEqual(second.reason, 'over-budget');
});

test('F7 adaptive: a weak-proficiency category bypasses the budget', () => {
  const profile = freshProfile();
  // Make debugging weak: proficiency < 40.
  profile.skills['debugging'] = {
    proficiency: 20, reps: 3, independent_reps: 0, assisted_reps: 3, last_updated: null,
  };
  // budget 0 => the ONLY path to coaching is the adaptive weak-area bypass.
  const cfg = config({ learning_budget: 0, adaptive: true, categories: { always_coach: [], never_coach: [] } });
  const neutral = decide({ classification: learningTask('performance'), config: cfg, profile });
  assert.strictEqual(neutral.coach, false, 'neutral category respects the 0% budget');
  const weak = decide({ classification: learningTask('debugging'), config: cfg, profile });
  assert.strictEqual(weak.coach, true);
  assert.strictEqual(weak.reason, 'adaptive-weak-area');
});

test('F7 adaptive off leaves the budget strictly deterministic even for weak areas', () => {
  const profile = freshProfile();
  profile.skills['debugging'] = {
    proficiency: 5, reps: 5, independent_reps: 0, assisted_reps: 5, last_updated: null,
  };
  const cfg = config({ learning_budget: 20, adaptive: false, categories: { always_coach: [], never_coach: [] } });
  const fired: number[] = [];
  for (let i = 1; i <= 15; i++) {
    if (decide({ classification: learningTask('debugging'), config: cfg, profile }).coach) fired.push(i);
  }
  assert.deepStrictEqual(fired, [5, 10, 15]); // identical to the non-adaptive schedule
});

test('F9: a graduated category is eligible but not coached; progressive:false restores gating', () => {
  const profile = freshProfile();
  profile.skills['debugging'] = {
    proficiency: 92, reps: 12, independent_reps: 10, assisted_reps: 2,
    last_updated: new Date().toISOString(),
  };
  const cfg = config({ learning_budget: 100, categories: { always_coach: [], never_coach: [] } });
  const grad = decide({ classification: learningTask('debugging'), config: cfg, profile });
  assert.strictEqual(grad.coach, false);
  assert.strictEqual(grad.reason, 'graduated-independent');
  assert.strictEqual(profile.counters.eligible, 1, 'still counted eligible — stats stay honest');

  const cfgOff = config({ learning_budget: 100, progressive: false, categories: { always_coach: [], never_coach: [] } });
  const gated = decide({ classification: learningTask('debugging'), config: cfgOff, profile });
  assert.strictEqual(gated.coach, true, 'progressive:false keeps coaching mastered areas');
});

test('never_coach categories are excluded before counters', () => {
  const profile = freshProfile();
  const cfg = config({ categories: { always_coach: [], never_coach: ['performance'] } });
  const result = decide({ classification: learningTask('performance'), config: cfg, profile });
  assert.strictEqual(result.coach, false);
  assert.strictEqual(result.reason, 'never-coach-category');
  assert.strictEqual(profile.counters.eligible, 0);
});

test('disabled and hint level 5 short-circuit to vanilla', () => {
  const profile = freshProfile();
  assert.strictEqual(
    decide({ classification: learningTask(), config: config({ enabled: false }), profile }).reason,
    'disabled',
  );
  assert.strictEqual(
    decide({
      classification: learningTask(),
      config: config({ hint_level: 5, categories: { always_coach: [], never_coach: [] } }),
      profile,
    }).reason,
    'hint-level-5-vanilla',
  );
  assert.strictEqual(profile.counters.eligible, 0);
});

test('budget 0 never coaches unpinned; budget 100 always coaches (onboarding off)', () => {
  const zero = freshProfile();
  const cfgZero = config({ learning_budget: 0, categories: { always_coach: [], never_coach: [] } });
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(decide({ classification: learningTask(), config: cfgZero, profile: zero }).coach, false);
  }
  // onboarding:false so the ramp doesn't soften the first few (see next test).
  const hundred = freshProfile();
  const cfgAll = config({ learning_budget: 100, onboarding: false, categories: { always_coach: [], never_coach: [] } });
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(decide({ classification: learningTask(), config: cfgAll, profile: hundred }).coach, true);
  }
});

test('onboarding ramp: a new user is not coached at the full 100% rate on the first eligible tasks', () => {
  const profile = freshProfile();
  const cfg = config({ learning_budget: 100, categories: { always_coach: [], never_coach: [] } });
  const fired: number[] = [];
  for (let i = 1; i <= 8; i++) {
    if (decide({ classification: learningTask(), config: cfg, profile }).coach) fired.push(i);
  }
  // First 5 eligible are capped at 50% (fires on the 2nd, 4th); from the 6th the
  // user's real 100% budget takes over and every task coaches.
  assert.deepStrictEqual(fired, [2, 4, 6, 7, 8]);
});

test('onboarding ramp respects a budget already below the ceiling and can be disabled', () => {
  // A 20% budget is already under the 50% onboarding ceiling — ramp is a no-op.
  const ramped = freshProfile();
  const cfg20 = config({ learning_budget: 20, categories: { always_coach: [], never_coach: [] } });
  const fired: number[] = [];
  for (let i = 1; i <= 15; i++) {
    if (decide({ classification: learningTask(), config: cfg20, profile: ramped }).coach) fired.push(i);
  }
  assert.deepStrictEqual(fired, [5, 10, 15]);
});

test('always_coach outranks graduation: a pinned category still coaches after it graduates', () => {
  const profile = freshProfile();
  // security is in the DEFAULT always_coach list, and here it is also graduated.
  profile.skills['security'] = {
    proficiency: 95, reps: 12, independent_reps: 12, assisted_reps: 0,
    last_updated: new Date().toISOString(),
  };
  const cfg = config({ learning_budget: 100 }); // default always_coach includes security
  const result = decide({ classification: learningTask('security'), config: cfg, profile });
  assert.strictEqual(result.coach, true, 'pinned beats auto-graduation');
  assert.strictEqual(result.reason, 'always-coach-category');
});

test('malformed budget values fall back to the shipped default (100) and clamp to [0,100]', () => {
  assert.strictEqual(normalizeBudget('nonsense'), 100);
  assert.strictEqual(normalizeBudget(undefined), 100);
  assert.strictEqual(normalizeBudget(-5), 0);
  assert.strictEqual(normalizeBudget(250), 100);
  assert.strictEqual(normalizeBudget('35'), 35);
});

test('per-category stats accumulate on the profile', () => {
  const profile = freshProfile();
  const cfg = config({ learning_budget: 20, categories: { always_coach: [], never_coach: [] } });
  for (let i = 0; i < 10; i++) decide({ classification: learningTask('debugging'), config: cfg, profile });
  assert.strictEqual(profile.categories['debugging']?.eligible, 10);
  assert.strictEqual(profile.categories['debugging']?.coached, 2);
});

test('corrupt profile counters self-heal instead of throwing', () => {
  // Simulates a hand-edited or truncated profile.json — types lie at runtime.
  const profile = {
    counters: { eligible: 'NaN-ish', coached: null },
    categories: { debugging: { eligible: 'x' } },
  } as unknown as Profile;
  const cfg = config({ learning_budget: 20, categories: { always_coach: [], never_coach: [] } });
  assert.doesNotThrow(() => decide({ classification: learningTask(), config: cfg, profile }));
  assert.strictEqual(profile.counters.eligible, 1);
});
