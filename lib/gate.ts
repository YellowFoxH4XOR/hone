// F2 Solution Gate — a tiny per-session state machine.
//
//   idle ──(coached learning prompt)──► pending
//   pending ──(next user prompt)──────► answered
//   pending ──(/hone:skip)────────────► skipped
//   pending ──(/hone:off)─────────────► idle   (reset(); see below)
//   answered/skipped ──(new coached prompt)──► pending
//
// Only `pending` blocks code-writing tools; `answered` relies on hint-level
// instructions (behavioral, not enforced) — the gate is a speed bump for the
// moment before the user has thought, not a cage afterward.

import type { GateState, SessionState } from './types.ts';

export const STATES: readonly GateState[] = ['idle', 'pending', 'answered', 'skipped'];

export function open(
  session: SessionState,
  task: { category?: string | null; prompt?: unknown },
): SessionState {
  session.gate = 'pending';
  session.category = task.category ?? null;
  session.task_preview = String(task.prompt ?? '').slice(0, 140);
  session.opened_at = new Date().toISOString();
  session.coached_count = (session.coached_count || 0) + 1;
  return session;
}

export function markAnswered(session: SessionState): boolean {
  if (session.gate !== 'pending') return false;
  session.gate = 'answered';
  return true;
}

export function skip(session: SessionState): boolean {
  const wasPending = session.gate === 'pending';
  session.gate = 'skipped';
  return wasPending;
}

// /hone:off must clear a still-open gate — not just flip the runtime toggle.
// Leaving it `pending` would make the NEXT prompt after /hone:on (which may
// be an unrelated, later request) get silently treated as "the answer" to a
// stale category: it would mark the gate answered, inject coaching about a
// task the user isn't thinking about, and log a skill signal off zero
// relevant input. `idle` (not `skipped`) because the user didn't choose to
// skip anything — Hone just stopped being active for a while.
export function reset(session: SessionState): boolean {
  const wasBlocking = isBlocking(session);
  session.gate = 'idle';
  session.category = null;
  session.task_preview = null;
  session.opened_at = null;
  return wasBlocking;
}

// Loose input types: hooks read session state from disk, which may be
// arbitrary JSON — these predicates must tolerate garbage.
export function isBlocking(session: { gate?: unknown } | null | undefined): boolean {
  return Boolean(session && session.gate === 'pending');
}

export function describe(session: { gate?: unknown } | null | undefined): GateState {
  if (!session || !STATES.includes(session.gate as GateState)) return 'idle';
  return session.gate as GateState;
}
