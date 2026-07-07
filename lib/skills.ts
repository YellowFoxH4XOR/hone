// F7 Skill Profile & Adaptive Coaching.
//
// Proficiency is a DIRECTIONAL behavioral proxy, not a graded score. Stage 1
// has no model-graded answers, so we infer from how the user engages coaching:
//   - answered a Solution Gate at a low hint level  -> worked it themselves (+)
//   - skipped, or leaned on a high hint level        -> wanted the answer   (-)
// Every consumer (statusline, /hone:status, docs) labels it as directional.
//
// Pure functions over a Profile — no I/O, fully unit-testable.

import type { AdaptiveAdjustment, Profile, SkillStats } from './types.ts';

// The learning categories the classifier can actually emit — the only places
// coaching signal exists. (Execution categories are never coached.)
export const SKILL_CATEGORIES = [
  'architecture',
  'debugging',
  'concurrency',
  'distributed_systems',
  'system_design',
  'security',
  'performance',
  'algorithms',
  'new_framework',
] as const;

export const BASELINE = 50; // neutral proficiency for an unseen category
const STEP = 6; // proficiency nudge per outcome (≈8 reps to cross a band)
const WEAK = 40; // below this: bias toward coaching, more Socratic
const STRONG = 70; // above this: back off, more direct

// Hint level at or below which answering the gate counts as "independent".
export const INDEPENDENT_HINT_CEILING = 2;

export function ensureSkill(profile: Profile, category: string): SkillStats {
  if (!profile.skills) profile.skills = {};
  let s = profile.skills[category];
  if (!s) {
    s = { proficiency: BASELINE, reps: 0, independent_reps: 0, assisted_reps: 0, last_updated: null };
    profile.skills[category] = s;
  }
  // Self-heal a hand-edited or truncated profile.
  if (!Number.isFinite(s.proficiency)) s.proficiency = BASELINE;
  if (!Number.isInteger(s.reps)) s.reps = 0;
  if (!Number.isInteger(s.independent_reps)) s.independent_reps = 0;
  if (!Number.isInteger(s.assisted_reps)) s.assisted_reps = 0;
  return s;
}

export function proficiencyOf(profile: Profile, category: string): number {
  const s = profile.skills?.[category];
  return s && Number.isFinite(s.proficiency) ? s.proficiency : BASELINE;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// Record a completed coached interaction. `independent` = the user engaged
// without leaning on a full solution. Mutates the profile in place.
export function recordOutcome(
  profile: Profile,
  category: string,
  opts: { independent: boolean; at?: string },
): SkillStats {
  const s = ensureSkill(profile, category);
  s.reps += 1;
  if (opts.independent) {
    s.independent_reps += 1;
    s.proficiency = clamp(s.proficiency + STEP, 0, 100);
  } else {
    s.assisted_reps += 1;
    s.proficiency = clamp(s.proficiency - STEP, 0, 100);
  }
  s.last_updated = opts.at ?? null;
  return s;
}

// How adaptive coaching should bend for this category. A no-op at neutral
// proficiency, so it never changes behavior until real signal accumulates.
export function adaptiveAdjustment(
  profile: Profile,
  category: string,
  opts: { adaptive: boolean },
): AdaptiveAdjustment {
  if (!opts.adaptive) return { pinCoach: false, hintDelta: 0, band: 'neutral' };
  const p = proficiencyOf(profile, category);
  if (p < WEAK) return { pinCoach: true, hintDelta: -1, band: 'weak' };
  if (p > STRONG) return { pinCoach: false, hintDelta: 1, band: 'strong' };
  return { pinCoach: false, hintDelta: 0, band: 'neutral' };
}

// Apply an adaptive hint delta to a base level, clamped so adaptivity never
// pushes a coached task down to 5 (vanilla) or below 0.
export function effectiveHint(baseHint: number, delta: number): number {
  return clamp(baseHint + delta, 0, 4);
}
