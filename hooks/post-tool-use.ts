#!/usr/bin/env node
// PostToolUse — F5 Automatic Feedback on user code.
//
// After code is written during a coached task (gate 'answered'), inject a
// senior-lens review so the user learns what to check — once per task, and
// only in coached sessions, so it never turns ordinary work into noise.

import { emit, run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import * as coaching from '../lib/coaching.ts';

const FILE_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

run(async (input) => {
  const tool = String(input.tool_name ?? '');
  if (!FILE_WRITING_TOOLS.has(tool)) return;

  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: input.cwd }), runtime);
  if (!config.hone.enabled || config.hone.autofeedback === false) return;

  const session = state.loadSession(input.session_id);
  // Only during an active coached task, and only once per task.
  if (session.gate !== 'answered' || session.feedback_given) return;

  session.feedback_given = true;
  state.saveSession(input.session_id, session);

  emit({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: coaching.autoFeedbackContext({
        category: session.category || 'learning',
        reviewOnly: config.hone.review_only !== false,
      }),
    },
  });
});
