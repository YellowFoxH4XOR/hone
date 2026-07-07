// F1 Learning Budget — deterministic, exact enforcement.
//
// Rule: on each eligible (learning-classified) request, increment `eligible`,
// then coach iff (coached + 1) <= budget% * eligible. This guarantees the
// coached/eligible ratio NEVER exceeds the budget, coaches as early as the
// cap allows, and is fully deterministic (no randomness — users should be
// able to predict when coaching fires). At the default 20%, the 5th, 10th,
// 15th... eligible request gets coached.
//
// `always_coach` categories bypass the ratio check but still count toward it,
// so pinning a category spends budget faster rather than hiding coaching
// volume from the user.
//
// decide() mutates `profile` counters in place; the caller persists it.

import type {
  BudgetDecision,
  BudgetReason,
  CategoryStats,
  Classification,
  Counters,
  HoneConfig,
  HoneSettings,
  Profile,
} from './types.ts';

export function decide(args: {
  classification: Classification;
  config: HoneConfig;
  profile: Profile;
}): BudgetDecision {
  const { classification, config, profile } = args;
  // Loaded config comes from user-editable YAML — treat every field as maybe-missing.
  const hone: Partial<HoneSettings> = config.hone ?? {};

  if (hone.enabled === false) {
    return verdict(false, 'disabled', classification);
  }
  if (classification.passthrough || classification.intent !== 'learning') {
    return verdict(false, 'execution-task', classification);
  }

  const category = classification.category;
  const never = listOf(hone, 'never_coach');
  const always = listOf(hone, 'always_coach');

  if (never.includes(category)) {
    return verdict(false, 'never-coach-category', classification);
  }

  const hintLevel = Number.isInteger(hone.hint_level) ? (hone.hint_level as number) : 1;
  if (hintLevel >= 5) {
    return verdict(false, 'hint-level-5-vanilla', classification);
  }

  const counters = ensureCounters(profile);
  const catStats = ensureCategory(profile, category);

  counters.eligible += 1;
  catStats.eligible += 1;

  const budgetPct = normalizeBudget(hone.learning_budget);
  // Integer arithmetic: (budgetPct/100)*eligible accumulates float error
  // (0.35*180 === 62.999…) and silently under-coaches at exact boundaries.
  const withinBudget = (counters.coached + 1) * 100 <= budgetPct * counters.eligible;
  const pinned = always.includes(category);
  const coach = pinned || withinBudget;

  if (coach) {
    counters.coached += 1;
    catStats.coached += 1;
  }

  const reason: BudgetReason = coach
    ? pinned && !withinBudget
      ? 'always-coach-category'
      : 'within-budget'
    : 'over-budget';
  return verdict(coach, reason, classification);
}

function verdict(coach: boolean, reason: BudgetReason, classification: Classification): BudgetDecision {
  return {
    coach,
    reason,
    intent: classification.intent,
    category: classification.category,
  };
}

export function normalizeBudget(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 20;
  return Math.min(100, Math.max(0, n));
}

function listOf(hone: Partial<HoneSettings>, key: 'always_coach' | 'never_coach'): string[] {
  const cats = hone.categories ?? ({} as Partial<HoneSettings['categories']>);
  const list = cats[key];
  return Array.isArray(list) ? list.map(String) : [];
}

const COUNTER_KEYS = ['eligible', 'coached', 'skipped', 'gates_answered'] as const;

function ensureCounters(profile: Profile): Counters {
  if (!profile.counters) profile.counters = {} as Counters;
  for (const key of COUNTER_KEYS) {
    if (!Number.isInteger(profile.counters[key])) profile.counters[key] = 0;
  }
  return profile.counters;
}

function ensureCategory(profile: Profile, category: string): CategoryStats {
  if (!profile.categories) profile.categories = {};
  let cat = profile.categories[category];
  if (!cat) {
    cat = { eligible: 0, coached: 0 };
    profile.categories[category] = cat;
  }
  if (!Number.isInteger(cat.eligible)) cat.eligible = 0;
  if (!Number.isInteger(cat.coached)) cat.coached = 0;
  return cat;
}
