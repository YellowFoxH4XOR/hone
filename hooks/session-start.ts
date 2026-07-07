#!/usr/bin/env node
// SessionStart — first-run setup, housekeeping, and one terse line of standing
// context so Claude knows Hone exists.

import { emit, run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import * as coaching from '../lib/coaching.ts';

run(async (input) => {
  state.ensureDirs();
  configLib.ensureDefaultConfigFile();
  state.gcSessions(7);
  state.touchCurrentSession(input.session_id);

  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: input.cwd }), runtime);
  if (!config.hone.enabled) return;

  const profile = state.loadProfile();
  const counters = profile.counters ?? { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 };
  let text = coaching.sessionStartContext({
    enabled: true,
    hintLevel: config.hone.hint_level,
    budget: config.hone.learning_budget,
    coached: counters.coached || 0,
    eligible: counters.eligible || 0,
  });
  if (!text) return;

  // A config file that failed to parse silently reverts to defaults — that
  // must not stay invisible until someone happens to run /hone:status.
  const errors = config.__errors ?? [];
  if (errors.length > 0) {
    text += `\nHone config warning (defaults are active — mention this to the user once): ${errors.join('; ')}`;
  }

  emit({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: text,
    },
  });
});
