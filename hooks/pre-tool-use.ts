#!/usr/bin/env node
// PreToolUse — enforcement layer for the Solution Gate (F2).
//
// While a session's gate is `pending` (coached task, user hasn't shared an
// approach yet), deny file-modifying tools. permissionDecision: "deny" holds
// even in bypassPermissions mode, which is exactly what a gate needs.
// Everything read-only stays allowed so Claude can still look at the code
// while it asks its questions.

import { emit, run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import * as gate from '../lib/gate.ts';
import * as coaching from '../lib/coaching.ts';
import { isFileWritingBash } from '../lib/bashwrite.ts';

const FILE_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function deny(reason: string): void {
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

run(async (input) => {
  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: input.cwd }), runtime);
  if (!config.hone.enabled) return;

  const session = state.loadSession(input.session_id);
  const interviewing = session.interview_mode === true;
  if (!gate.isBlocking(session) && !interviewing) return;

  const reason = interviewing
    ? 'Hone interview mode: no code is written during an interview — keep questioning. The user can end it with /hone:interview stop.'
    : coaching.gateDenyReason(session);

  const tool = String(input.tool_name ?? '');

  if (FILE_WRITING_TOOLS.has(tool)) {
    deny(reason);
    return;
  }

  if (tool === 'Bash') {
    const command = String(input.tool_input?.command ?? '');
    // The /hone:skip and /hone:interview escape hatches must always work.
    if (command.includes('hone-ctl')) return;
    if (isFileWritingBash(command)) {
      deny(reason);
    }
  }
});
