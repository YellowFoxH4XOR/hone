#!/usr/bin/env node
// Stop — F6 Reflection + liveness.
//
// After a coached task completes (the gate reached 'answered'), invite the
// user to reflect once per session. We block the stop so Claude actually asks;
// a `reflection_done` guard bounds it to a single fire (stop_hook_active was
// removed from the API, so we can't rely on it to break the loop).

import { emit, run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import * as coaching from '../lib/coaching.ts';

run(async (input) => {
  const profile = state.loadProfile();
  profile.last_active_at = new Date().toISOString();

  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: input.cwd }), runtime);
  const session = state.loadSession(input.session_id);

  const wantsReflection =
    config.hone.enabled &&
    config.hone.reflection !== 'off' &&
    session.gate === 'answered' && // a coached task ran its full cycle
    !session.reflection_done;

  if (!wantsReflection) {
    state.saveProfile(profile);
    return;
  }

  session.reflection_done = true;
  state.saveSession(input.session_id, session);
  if (!profile.counters) {
    profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 };
  }
  profile.counters.reflections = (profile.counters.reflections || 0) + 1;
  state.saveProfile(profile);

  // decision:block keeps Claude going so it can ask the reflection question;
  // additionalContext carries the prompt.
  emit({
    decision: 'block',
    reason: coaching.reflectionPrompt({ category: session.category || 'learning' }),
  });
});
