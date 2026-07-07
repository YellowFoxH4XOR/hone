import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from './yaml.ts';
import * as state from './state.ts';
import type { HoneConfig, RuntimeState, YamlMap } from './types.ts';

// Defaults mirror PRD §11. config.yaml (user-owned) overrides these;
// state.json runtime toggles (set by /hone commands) override config.yaml.
export const DEFAULTS: HoneConfig = {
  hone: {
    enabled: true,
    learning_budget: 20,
    hint_level: 1,
    review_only: true,
    allow_full_solution: true,
    reflection: 'optional', // off | optional | on  (Stage 1 feature; stored now)
    categories: {
      always_coach: ['architecture', 'concurrency', 'distributed_systems', 'security'],
      // Execution-type tasks (tests, boilerplate, crud, ...) are never coached
      // by definition — never_coach exists to mute LEARNING categories.
      never_coach: [],
    },
    dashboard: {
      statusline: true,
      local_server: false, // Stage 1
      port: 4173,
    },
    telemetry: {
      otel_export: false, // Stage 3
    },
  },
};

export function configPath(): string {
  return path.join(state.honeDir(), 'config.yaml');
}

// Load user config (~/.claude/hone/config.yaml), then per-repo .hone.yaml if
// present in cwd, merged over defaults. A malformed file must NEVER break a
// hook — fall back to whatever parsed and record the error for /hone:status.
export function loadConfig(opts: { cwd?: string } = {}): HoneConfig {
  let merged: unknown = clone(DEFAULTS);
  const errors: string[] = [];

  for (const file of [configPath(), opts.cwd ? path.join(opts.cwd, '.hone.yaml') : null]) {
    if (!file) continue;
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // missing file is fine
    }
    try {
      const parsed = yaml.parse(text);
      if (parsed && typeof parsed === 'object') merged = deepMerge(merged, parsed as YamlMap);
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // User YAML is untrusted; downstream consumers stay defensive about shape.
  const result = merged as HoneConfig;
  result.__errors = errors;
  return result;
}

// Effective settings = runtime overrides (state.json) over config.yaml over
// defaults. Runtime overrides exist so /hone commands never have to edit the
// user's hand-written YAML.
export function effective(config: HoneConfig, runtime: RuntimeState = {}): HoneConfig {
  const hone = config?.hone ?? DEFAULTS.hone;
  const enabled =
    typeof runtime.enabled === 'boolean' ? runtime.enabled : hone.enabled !== false;
  const hintLevel = clampHint(
    Number.isInteger(runtime.hint_level) ? (runtime.hint_level as number) : hone.hint_level,
  );
  const result = clone(config);
  result.hone = { ...clone(hone), enabled, hint_level: hintLevel };
  return result;
}

export function clampHint(n: unknown): number {
  if (!Number.isInteger(n)) return 1;
  return Math.min(5, Math.max(0, n as number));
}

// Write a commented starter config on first run — the config file doubles as
// user-facing documentation.
export function ensureDefaultConfigFile(): boolean {
  const file = configPath();
  if (fs.existsSync(file)) return false;
  state.ensureDirs();
  fs.writeFileSync(file, DEFAULT_CONFIG_YAML);
  return true;
}

export const DEFAULT_CONFIG_YAML = `# Hone configuration
# Runtime toggles set via /hone commands live in state.json, not here;
# this file is yours and Hone never edits it.

hone:
  enabled: true
  learning_budget: 20          # % of eligible (learning) requests that get coached
  hint_level: 1                # 0 questions-only ... 5 full implementation (vanilla)
  review_only: true            # never rewrite your code unless you ask
  allow_full_solution: true    # reserved (Stage 1); /hone:skip is always available
  reflection: optional         # off | optional | on   (Stage 1)
  categories:
    # always_coach bypasses the budget. never_coach mutes LEARNING categories
    # (e.g. [performance, new_framework]) — execution tasks (tests, boilerplate,
    # crud, ...) are never coached regardless.
    always_coach: [architecture, concurrency, distributed_systems, security]
    never_coach: []
  dashboard:
    statusline: true           # the opt-in statusline renders nothing when false
    local_server: false        # Stage 1
    port: 4173
  telemetry:
    otel_export: false         # Stage 3 (teams); nothing leaves this machine
`;

function deepMerge(base: unknown, override: unknown): unknown {
  // A null override (a "key:" with every child commented out) means "no
  // opinion", not "erase the defaults underneath".
  if (override === null || override === undefined) return clone(base);
  if (!isPlainObject(base) || !isPlainObject(override)) return clone(override);
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in base ? deepMerge(base[key], value) : clone(value);
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}
