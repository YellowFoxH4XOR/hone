// F2 Solution Gate — a tiny per-session state machine.
//
//   idle ──(coached learning prompt)──► pending
//   pending ──(next user prompt)──────► answered
//   pending ──(/hone:skip)────────────► skipped
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

// Loose input types: hooks read session state from disk, which may be
// arbitrary JSON — these predicates must tolerate garbage.
export function isBlocking(session: { gate?: unknown } | null | undefined): boolean {
  return Boolean(session && session.gate === 'pending');
}

export function describe(session: { gate?: unknown } | null | undefined): GateState {
  if (!session || !STATES.includes(session.gate as GateState)) return 'idle';
  return session.gate as GateState;
}
