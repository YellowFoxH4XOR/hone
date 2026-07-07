import { test } from 'node:test';
import assert from 'node:assert';
import {
  recordOutcome,
  proficiencyOf,
  adaptiveAdjustment,
  effectiveHint,
  ensureSkill,
  decayedProficiency,
  graduated,
  BASELINE,
  GRADUATE_PROFICIENCY,
  GRADUATE_REPS,
} from '../lib/skills.ts';
import type { Profile } from '../lib/types.ts';

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

test('an unseen category sits at the neutral baseline', () => {
  const p = freshProfile();
  assert.strictEqual(proficiencyOf(p, 'concurrency'), BASELINE);
});

test('F9: graduation requires BOTH high proficiency and enough reps', () => {
  const p = freshProfile();
  p.skills['security'] = {
    proficiency: 95, reps: GRADUATE_REPS - 1, independent_reps: 7, assisted_reps: 0, last_updated: null,
  };
  assert.strictEqual(graduated(p, 'security'), false, 'too few reps');
  p.skills['debugging'] = {
    proficiency: GRADUATE_PROFICIENCY - 1, reps: 20, independent_reps: 15, assisted_reps: 5, last_updated: null,
  };
  assert.strictEqual(graduated(p, 'debugging'), false, 'below the proficiency bar');
  p.skills['algorithms'] = {
    proficiency: 90, reps: 10, independent_reps: 9, assisted_reps: 1, last_updated: null,
  };
  assert.strictEqual(graduated(p, 'algorithms'), true);
  assert.strictEqual(graduated(p, 'concurrency'), false, 'unseen category never graduates');
});

test('F9: proficiency decays toward baseline with disuse, capped, and reverses graduation', () => {
  const p = freshProfile();
  const tenWeeksAgo = new Date(Date.now() - 10 * 7 * 24 * 3600 * 1000).toISOString();
  p.skills['algorithms'] = {
    proficiency: 90, reps: 10, independent_reps: 9, assisted_reps: 1, last_updated: tenWeeksAgo,
  };
  assert.strictEqual(decayedProficiency(p, 'algorithms'), 80); // -1/idle week
  assert.strictEqual(graduated(p, 'algorithms'), false, 'stale mastery re-enters coaching');

  // Decay is capped: even a year idle never wipes the signal.
  const yearAgo = new Date(Date.now() - 52 * 7 * 24 * 3600 * 1000).toISOString();
  p.skills['algorithms']!.last_updated = yearAgo;
  assert.strictEqual(decayedProficiency(p, 'algorithms'), 90 - 15);

  // Drifts toward baseline from below too, never crossing it.
  p.skills['weakness'] = {
    proficiency: 44, reps: 3, independent_reps: 0, assisted_reps: 3, last_updated: yearAgo,
  };
  assert.strictEqual(decayedProficiency(p, 'weakness'), BASELINE);

  // Fresh activity -> no decay.
  p.skills['algorithms']!.last_updated = new Date().toISOString();
  assert.strictEqual(decayedProficiency(p, 'algorithms'), 90);
});

test('independent reps raise proficiency; assisted reps lower it', () => {
  const p = freshProfile();
  recordOutcome(p, 'debugging', { independent: true });
  assert.ok(proficiencyOf(p, 'debugging') > BASELINE);
  const afterUp = proficiencyOf(p, 'debugging');
  recordOutcome(p, 'debugging', { independent: false });
  assert.ok(proficiencyOf(p, 'debugging') < afterUp);
  const s = p.skills['debugging']!;
  assert.strictEqual(s.reps, 2);
  assert.strictEqual(s.independent_reps, 1);
  assert.strictEqual(s.assisted_reps, 1);
});

test('proficiency clamps to [0,100] under long streaks', () => {
  const p = freshProfile();
  for (let i = 0; i < 100; i++) recordOutcome(p, 'security', { independent: true });
  assert.strictEqual(proficiencyOf(p, 'security'), 100);
  for (let i = 0; i < 100; i++) recordOutcome(p, 'security', { independent: false });
  assert.strictEqual(proficiencyOf(p, 'security'), 0);
});

test('adaptive is a no-op at neutral proficiency (preserves exact-budget guarantee)', () => {
  const p = freshProfile();
  const adj = adaptiveAdjustment(p, 'architecture', { adaptive: true });
  assert.deepStrictEqual(adj, { pinCoach: false, hintDelta: 0, band: 'neutral' });
});

test('weak areas pin coaching and push toward Socratic; strong areas back off', () => {
  const p = freshProfile();
  // Drive concurrency weak, algorithms strong.
  for (let i = 0; i < 3; i++) recordOutcome(p, 'concurrency', { independent: false });
  for (let i = 0; i < 5; i++) recordOutcome(p, 'algorithms', { independent: true });
  assert.ok(proficiencyOf(p, 'concurrency') < 40);
  assert.ok(proficiencyOf(p, 'algorithms') > 70);

  const weak = adaptiveAdjustment(p, 'concurrency', { adaptive: true });
  assert.strictEqual(weak.band, 'weak');
  assert.strictEqual(weak.pinCoach, true);
  assert.strictEqual(weak.hintDelta, -1);

  const strong = adaptiveAdjustment(p, 'algorithms', { adaptive: true });
  assert.strictEqual(strong.band, 'strong');
  assert.strictEqual(strong.pinCoach, false);
  assert.strictEqual(strong.hintDelta, 1);
});

test('adaptive disabled is always a no-op regardless of proficiency', () => {
  const p = freshProfile();
  for (let i = 0; i < 5; i++) recordOutcome(p, 'concurrency', { independent: false });
  const adj = adaptiveAdjustment(p, 'concurrency', { adaptive: false });
  assert.deepStrictEqual(adj, { pinCoach: false, hintDelta: 0, band: 'neutral' });
});

test('effectiveHint clamps so adaptivity never reaches vanilla (5) or below 0', () => {
  assert.strictEqual(effectiveHint(0, -1), 0);
  assert.strictEqual(effectiveHint(4, 1), 4); // never bumps a coached task to 5
  assert.strictEqual(effectiveHint(1, -1), 0);
  assert.strictEqual(effectiveHint(3, 1), 4);
});

test('ensureSkill self-heals a corrupt/hand-edited skill entry', () => {
  const p = freshProfile();
  // Simulate a truncated profile.json.
  (p.skills as Record<string, unknown>)['debugging'] = { proficiency: 'NaN', reps: null };
  const s = ensureSkill(p, 'debugging');
  assert.strictEqual(s.proficiency, BASELINE);
  assert.strictEqual(s.reps, 0);
});
