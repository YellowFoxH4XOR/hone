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
const WEAK = 40; // below this: bias toward coaching, more Socratic
const STRONG = 70; // above this: back off, more direct

// Fixed-parameter Bayesian Knowledge Tracing (Corbett & Anderson 1994) replaces
// the old flat ±6 nudge: a principled belief update instead of a linear ramp.
// Parameters are held FIXED (not fit per user) because per-category event counts
// here are far too sparse to fit reliably — Pradhan et al. (2026) recommend
// exactly this for low-data settings. "Correct" = engaged the gate
// independently; "incorrect" = leaned on help or skipped past the grace reserve.
const BKT_GUESS = 0.2; // P(right answer without knowing)
const BKT_SLIP = 0.1; // P(wrong answer despite knowing)
const BKT_TRANSIT = 0.1; // P(learning it on this rep)
// Clamp the working probability away from 0 and 1 BEFORE the Bayes step. At
// exactly 1, P(known | incorrect) collapses to 1 — an absorbing state where an
// assisted/incorrect outcome can no longer lower proficiency, silently breaking
// the "assisted lowers proficiency" invariant. This is the exact degeneracy
// Beck & Chang (2007) warn about; the clamp keeps every update reversible.
const BKT_MIN = 0.02;
const BKT_MAX = 0.98;

// F9: graduation — a category this strong, over this many reps, has earned
// independence and stops gating entirely.
export const GRADUATE_PROFICIENCY = 85;
export const GRADUATE_REPS = 8;
// Debugging is the skill most damaged by AI assistance, and pure question-
// asking beat every richer hint pattern for it (Shen & Tamkin 2026,
// arXiv:2601.20245). So it earns independence more slowly than other skills.
export const DEBUG_GRADUATE_REPS = 12;

export function graduateReps(category: string): number {
  return category === 'debugging' ? DEBUG_GRADUATE_REPS : GRADUATE_REPS;
}

// Unused skills decay toward baseline (1 point per idle week, capped) so
// graduation is reversible rather than a permanent badge.
const DECAY_PER_WEEK = 1;
// The cap MUST exceed (100 - GRADUATE_PROFICIENCY) = 15. With the old cap of
// exactly 15 a maxed-out skill (proficiency 100) floored at 100-15 = 85 — the
// graduation bar itself — so graduated() stayed true forever and "reversible"
// was a lie. 40 lets even a fully-mastered skill fall out of graduation after
// ~16 idle weeks; the BASELINE floor still stops the drift at neutral.
const DECAY_CAP = 40;

// Hint level at or below which answering the gate counts as "independent".
export const INDEPENDENT_HINT_CEILING = 2;

// Cold-start guidance (F9 calibration). A category with almost no track record
// gives no evidence the user is an expert, and minimal-guidance coaching
// (hint 0, pure Socratic) is the wrong default for a likely novice: worked
// examples beat unguided problem-solving for novices (Kirschner, Sweller &
// Clark 2006; Kalyuga's expertise-reversal effect), and a 2026 CHIWORK RCT
// found a "guided hints" condition produced the largest learning gains AND the
// lowest frustration of every condition tested. So until a category has a few
// reps, coaching is floored at a guided level rather than pure questions.
export const COLD_START_REPS = 3;
export const COLD_START_HINT_FLOOR = 2; // "high-level ideas" — guided, not solved
// Debugging is the deliberate exception on BOTH levers: it keeps its hint-0
// cold start (no floor), and it holds a lower coaching ceiling so even a strong
// or insistent signal can't push a coached debugging task past high-level ideas
// into pseudocode/partial code. (/hone:skip and /hone:hint 5 still bypass
// coaching entirely, so this bounds coaching depth, not the user's options.)
export const DEBUG_HINT_CEILING = 2;

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
  if (s.grace_skips_used != null && !Number.isInteger(s.grace_skips_used)) s.grace_skips_used = 0;
  return s;
}

export function proficiencyOf(profile: Profile, category: string): number {
  const s = profile.skills?.[category];
  return s && Number.isFinite(s.proficiency) ? s.proficiency : BASELINE;
}

// F9: proficiency as-read — raw score drifted toward baseline by idle time.
// A category untouched for months slides back toward neutral, so a graduated
// category eventually re-enters coaching if it goes stale.
export function decayedProficiency(profile: Profile, category: string, now = new Date()): number {
  const raw = proficiencyOf(profile, category);
  const s = profile.skills?.[category];
  if (!s?.last_updated) return raw;
  const then = Date.parse(s.last_updated);
  if (!Number.isFinite(then)) return raw;
  const idleWeeks = Math.max(0, (now.getTime() - then) / (7 * 24 * 3600 * 1000));
  const decay = Math.min(DECAY_CAP, Math.floor(idleWeeks) * DECAY_PER_WEEK);
  if (decay === 0) return raw;
  // Drift toward baseline from either side, never past it.
  return raw > BASELINE ? Math.max(BASELINE, raw - decay) : Math.min(BASELINE, raw + decay);
}

// F9: has this category earned independence? Uses decayed proficiency so the
// answer degrades naturally with disuse.
export function graduated(profile: Profile, category: string, now = new Date()): boolean {
  const s = profile.skills?.[category];
  if (!s || !Number.isInteger(s.reps) || s.reps < graduateReps(category)) return false;
  return decayedProficiency(profile, category, now) >= GRADUATE_PROFICIENCY;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// F6/spacing: a skill whose idle decay has pulled it at least STALE_DROP points
// below its raw score has gone stale enough to be worth a nudge — spaced review
// at the point of impending forgetting is exactly what the spacing effect
// rewards (Cepeda et al. 2006, 317-experiment meta-analysis). Reuses the decay
// math already stored on the profile; no new capture surface. Most-stale first.
export const STALE_DROP = 8;

export function staleSkills(
  profile: Profile,
  now = new Date(),
): Array<{ category: string; raw: number; decayed: number }> {
  const out: Array<{ category: string; raw: number; decayed: number }> = [];
  for (const category of Object.keys(profile.skills ?? {})) {
    const s = profile.skills?.[category];
    if (!s || !s.last_updated) continue;
    const raw = proficiencyOf(profile, category);
    const decayed = decayedProficiency(profile, category, now);
    if (raw - decayed >= STALE_DROP) out.push({ category, raw, decayed });
  }
  return out.sort((a, b) => b.raw - b.decayed - (a.raw - a.decayed));
}

// One Bayesian Knowledge Tracing step: update belief that the skill is known,
// given a correct (independent) or incorrect (assisted) observation, then apply
// the learning-transit probability. Working probability is clamped off 0/1 to
// avoid the absorbing-state degeneracy (see BKT_MIN/MAX). Returns 0-100.
export function bktUpdate(proficiency: number, correct: boolean): number {
  const prior = clamp(proficiency / 100, BKT_MIN, BKT_MAX);
  const posterior = correct
    ? (prior * (1 - BKT_SLIP)) / (prior * (1 - BKT_SLIP) + (1 - prior) * BKT_GUESS)
    : (prior * BKT_SLIP) / (prior * BKT_SLIP + (1 - prior) * (1 - BKT_GUESS));
  const learned = posterior + (1 - posterior) * BKT_TRANSIT;
  return Math.round(clamp(learned * 100, 0, 100));
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
  } else {
    s.assisted_reps += 1;
  }
  s.proficiency = bktUpdate(s.proficiency, opts.independent);
  s.last_updated = opts.at ?? null;
  return s;
}

// A gate answer only moves the skill profile if it shows real engagement. We
// can't grade correctness, but we can refuse to credit a rubber stamp ("ok",
// "you decide") as independent work — otherwise a user graduates a skill by
// pressing through the gate without thinking (gaming, Baker et al. 2004; Neagu
// et al. 2026). The gate still opens on ANY reply; only the profile write is
// gated. A terse but real approach ("row-level locking") still counts.
export function isSubstantiveAnswer(text: unknown): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const words = t.split(/\s+/).filter(Boolean);
  // A pure deferral / rubber stamp, whatever its length.
  if (
    /^(ok(ay)?|k|sure|yes|yep|yeah|no|nope|fine|do it|go ahead|you (decide|choose|pick|do it|know best)|whatever|idk|i (really )?(don'?t|dont) (know|care)|not sure|no idea|dunno|just do it|sounds good|lgtm|makes sense|agreed?)\b[\s!.,]*$/i.test(
      t,
    )
  ) {
    return false;
  }
  // A word or two is not an approach.
  return words.length >= 3;
}

// A small, capped reserve of penalty-free /hone:skip uses PER CATEGORY. An
// occasional escape hatch shouldn't read as deskilling: Sharif & Shu (2017)
// found a capped "emergency reserve" beats both rigid and fully-lenient goal
// designs, and Lally et al. (2010) found a single missed rep doesn't derail
// habit formation. Past the reserve, a skip is an assisted signal like before.
export const GRACE_SKIP_RESERVE = 2;

export function recordSkip(
  profile: Profile,
  category: string,
  opts: { at?: string } = {},
): { penalized: boolean } {
  const s = ensureSkill(profile, category);
  const used = Number.isInteger(s.grace_skips_used) ? (s.grace_skips_used as number) : 0;
  if (used < GRACE_SKIP_RESERVE) {
    s.grace_skips_used = used + 1;
    return { penalized: false };
  }
  recordOutcome(profile, category, { independent: false, at: opts.at });
  return { penalized: true };
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

// The cold-start FLOOR for a category: the minimum hint level a not-yet-known
// category is coached at. 0 (no floor) once the user has a track record, and
// always 0 for debugging (see DEBUG_HINT_CEILING notes).
export function coldStartHintFloor(profile: Profile, category: string): number {
  if (category === 'debugging') return 0;
  const s = profile.skills?.[category];
  const reps = s && Number.isInteger(s.reps) ? s.reps : 0;
  return reps < COLD_START_REPS ? COLD_START_HINT_FLOOR : 0;
}

// The per-category coaching CEILING: the highest hint level coaching will reach
// for this category. 4 everywhere except debugging, which stays Socratic.
export function categoryHintCeiling(category: string): number {
  return category === 'debugging' ? DEBUG_HINT_CEILING : 4;
}

// The single hint-level entry point for the coaching hooks. Order matters:
// base+adaptive delta, then RAISE to the cold-start floor (a floor never lowers
// a level the user or adaptivity set higher), then CAP at the category ceiling
// (applied last, so the floor can never punch through it). A user who wants out
// of a low ceiling entirely still has /hone:hint 5 and /hone:skip.
export function coachingHint(
  profile: Profile,
  category: string,
  baseHint: number,
  delta: number,
): number {
  const floored = Math.max(effectiveHint(baseHint, delta), coldStartHintFloor(profile, category));
  return Math.min(floored, categoryHintCeiling(category));
}
