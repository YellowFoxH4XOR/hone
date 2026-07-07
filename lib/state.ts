import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Profile, RuntimeState, SessionState } from './types.ts';

// All Hone state is local-first, under ~/.claude/hone/ :
//   config.yaml        user-declared defaults (never machine-edited)
//   state.json         runtime toggles set by /hone commands (machine-owned)
//   profile.json       skill profile + budget counters
//   sessions/<id>.json per-session gate state
//   sessions/.current  pointer to the most recently active session id
// HONE_STATE_DIR overrides the root for tests.

export function honeDir(): string {
  return process.env.HONE_STATE_DIR || path.join(os.homedir(), '.claude', 'hone');
}

function sessionsDir(): string {
  return path.join(honeDir(), 'sessions');
}

export function ensureDirs(): void {
  fs.mkdirSync(sessionsDir(), { recursive: true });
}

// Loaded state files are user-machine JSON: they can be missing, truncated,
// or hand-edited. The `as T` at this boundary is deliberate — every consumer
// treats fields defensively.
function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// Atomic-ish write: temp file + rename, so a crashed hook never leaves a
// half-written JSON file that would poison every later hook invocation.
function saveJson(file: string, value: unknown): void {
  ensureDirs();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// ---- profile ---------------------------------------------------------------

export function defaultProfile(): Profile {
  return {
    version: 1,
    created_at: new Date().toISOString(),
    counters: { eligible: 0, coached: 0, skipped: 0, gates_answered: 0 },
    categories: {},
    hint_history: [],
  };
}

function profilePath(): string {
  return path.join(honeDir(), 'profile.json');
}

export function loadProfile(): Profile {
  return loadJson<Profile>(profilePath(), defaultProfile());
}

export function saveProfile(profile: Profile): void {
  saveJson(profilePath(), profile);
}

// ---- runtime state (owned by /hone commands) -------------------------------

function statePath(): string {
  return path.join(honeDir(), 'state.json');
}

export function loadRuntimeState(): RuntimeState {
  return loadJson<RuntimeState>(statePath(), {});
}

export function saveRuntimeState(state: RuntimeState): void {
  saveJson(statePath(), state);
}

// ---- per-session gate state -------------------------------------------------

function sanitizeSessionId(id: unknown): string {
  return String(id ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

export function sessionPath(sessionId: unknown): string {
  return path.join(sessionsDir(), `${sanitizeSessionId(sessionId)}.json`);
}

export function defaultSession(): SessionState {
  return {
    gate: 'idle',
    category: null,
    task_preview: null,
    opened_at: null,
    updated_at: null,
    coached_count: 0,
  };
}

export function loadSession(sessionId: unknown): SessionState {
  return loadJson<SessionState>(sessionPath(sessionId), defaultSession());
}

export function saveSession(sessionId: unknown, session: SessionState): void {
  session.updated_at = new Date().toISOString();
  saveJson(sessionPath(sessionId), session);
}

// Pointer file so `hone-ctl` (run from a slash command, which doesn't know its
// own session id) can act on "the session the user is currently in".
export function touchCurrentSession(sessionId: unknown): void {
  ensureDirs();
  fs.writeFileSync(path.join(sessionsDir(), '.current'), sanitizeSessionId(sessionId));
}

export function currentSessionId(): string | null {
  try {
    const id = fs.readFileSync(path.join(sessionsDir(), '.current'), 'utf8').trim();
    return id || null;
  } catch {
    return null;
  }
}

export function gcSessions(maxAgeDays = 7): number {
  let removed = 0;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(sessionsDir());
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(sessionsDir(), name);
    try {
      if (fs.statSync(file).mtimeMs < cutoff) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch {
      // best effort; never let cleanup break a hook
    }
  }
  return removed;
}
