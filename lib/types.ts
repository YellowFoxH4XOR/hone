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

export interface SessionState {
  gate: GateState;
  category: string | null;
  task_preview: string | null;
  opened_at: string | null;
  updated_at: string | null;
  coached_count: number;
}

export interface Counters {
  eligible: number;
  coached: number;
  skipped: number;
  gates_answered: number;
}

export interface CategoryStats {
  eligible: number;
  coached: number;
}

export interface Profile {
  version: number;
  created_at: string;
  counters: Counters;
  categories: Record<string, CategoryStats>;
  hint_history: Array<{ at: string; level: number }>;
  last_active_at?: string;
}

// Runtime toggles set by /hone commands (state.json). Overrides config.yaml.
export interface RuntimeState {
  enabled?: boolean;
  hint_level?: number;
}

export interface HoneSettings {
  enabled: boolean;
  learning_budget: number;
  hint_level: number;
  review_only: boolean;
  allow_full_solution: boolean;
  reflection: 'off' | 'optional' | 'on';
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
