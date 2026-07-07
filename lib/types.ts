// Shared types for Hone. Types only — this module must stay free of runtime
// code so importing it never costs hook-startup time.

export type Intent = 'learning' | 'execution';

export interface Classification {
  intent: Intent;
  category: string;
  passthrough: boolean;
  scores: { learning: number; execution: number };
  signals: string[];
}

export type GateState = 'idle' | 'pending' | 'answered' | 'skipped';

// The most recent routed (non-passthrough) classification — what /hone:wrong
// reports on.
export interface LastClassification {
  prompt_preview: string;
  intent: Intent;
  category: string;
  coached: boolean;
  at: string;
}

export interface SessionState {
  gate: GateState;
  category: string | null;
  task_preview: string | null;
  opened_at: string | null;
  updated_at: string | null;
  coached_count: number;
  // F5: auto-feedback fires at most once per coached task; reset when a new
  // gate opens.
  feedback_given?: boolean;
  // F6: reflection fires at most once per session (stop_hook_active was
  // removed from the API, so we guard the Stop-hook loop ourselves).
  reflection_done?: boolean;
  // F10: interview mode — every prompt becomes interviewer-style questioning
  // and file edits are blocked until `/hone:interview stop`.
  interview_mode?: boolean;
  interview_topic?: string | null;
  last_classification?: LastClassification;
}

export interface Counters {
  eligible: number;
  coached: number;
  skipped: number;
  gates_answered: number;
  reflections: number;
  corrections?: number; // /hone:wrong reports
  interviews?: number; // interview sessions started
}

export interface CategoryStats {
  eligible: number;
  coached: number;
}

// F7: per-category proficiency. `proficiency` is a DIRECTIONAL behavioral
// proxy (0-100, 50 = neutral), not a graded measure of comprehension —
// it moves on how the user engages coaching, not on whether their answers
// were correct.
export interface SkillStats {
  proficiency: number;
  reps: number; // coached tasks in this category
  independent_reps: number; // gate answered at a low hint level (worked it themselves)
  assisted_reps: number; // skipped, or leaned on a high hint level
  last_updated: string | null;
}

export interface Profile {
  version: number;
  created_at: string;
  counters: Counters;
  categories: Record<string, CategoryStats>;
  skills: Record<string, SkillStats>;
  hint_history: Array<{ at: string; level: number }>;
  last_active_at?: string;
}

export interface AdaptiveAdjustment {
  pinCoach: boolean; // weak area — bias toward coaching (bypass the budget)
  hintDelta: number; // weak → more Socratic (-1); strong → more direct (+1)
  band: 'weak' | 'neutral' | 'strong';
}

// Runtime toggles set by /hone commands (state.json). Overrides config.yaml.
export interface RuntimeState {
  enabled?: boolean;
  hint_level?: number;
  // De-escalation levers (/hone:budget, /hone:reflection) — same
  // runtime-overrides-config pattern as hint_level, so neither requires
  // hand-editing config.yaml.
  learning_budget?: number;
  reflection?: 'off' | 'optional' | 'on';
}

export interface HoneSettings {
  enabled: boolean;
  learning_budget: number;
  hint_level: number;
  review_only: boolean;
  allow_full_solution: boolean;
  reflection: 'off' | 'optional' | 'on';
  autofeedback: boolean; // F5: review code written during coached tasks
  adaptive: boolean; // F7: bias coaching by per-category proficiency
  progressive: boolean; // F9: graduated categories (85+ proficiency, 8+ reps) stop gating
  onboarding: boolean; // F9: soften the coaching rate for a new user's first few eligible tasks
  categories: {
    always_coach: string[];
    never_coach: string[];
  };
  dashboard: {
    statusline: boolean;
    local_server: boolean;
    port: number;
  };
  telemetry: {
    otel_export: boolean;
  };
}

export interface HoneConfig {
  hone: HoneSettings;
  __errors?: string[];
}

export type BudgetReason =
  | 'disabled'
  | 'execution-task'
  | 'never-coach-category'
  | 'hint-level-5-vanilla'
  | 'within-budget'
  | 'always-coach-category'
  | 'adaptive-weak-area'
  | 'graduated-independent'
  | 'over-budget';

export interface BudgetDecision {
  coach: boolean;
  reason: BudgetReason;
  intent: Intent;
  category: string;
}

export interface HintRule {
  name: string;
  rule: string;
}

// What Claude Code pipes to hooks on stdin. Fields are event-specific; all
// optional here because a hook must fail open on any unexpected shape.
export interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  cwd?: string;
  prompt?: string;
  user_input?: string;
  tool_name?: string;
  tool_input?: { command?: string; [key: string]: unknown };
  source?: string;
  permission_mode?: string;
  [key: string]: unknown;
}

// YAML subset value model.
export type YamlValue = string | number | boolean | null | YamlValue[] | YamlMap;
export interface YamlMap {
  [key: string]: YamlValue;
}
