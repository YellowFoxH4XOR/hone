#!/usr/bin/env node
// Stop — F6 Reflection (deferred) + liveness.
//
// Reflection is NOT asked here anymore. Blocking at exit is the worst-timed,
// highest-friction moment to demand new work (CHIWORK'26), and an immediate
// self-judgment predicts retention worse than a delayed one (Nelson & Dunlosky
// 1991). So when a coached task ran its full cycle, we QUEUE a reflection and
// let the next SessionStart surface it, non-blocking. No decision:block.

import { run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';

run(async (input) => {
  const profile = state.loadProfile();
  profile.last_active_at = new Date().toISOString();

  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: input.cwd }), runtime);
  const session = state.loadSession(input.session_id);

  // A coached task ran its full cycle if the gate reached 'answered'. Queue one
  // reflection for next session; the freshest coached work is the most useful to
  // recall, so a later coached task in the same session overwrites an earlier
  // pending one. Surfacing (and the reflections counter) happens at SessionStart.
  const coachedThisSession = session.gate === 'answered';
  if (config.hone.enabled && config.hone.reflection !== 'off' && coachedThisSession) {
    profile.pending_reflection = {
      category: session.category || 'learning',
      at: new Date().toISOString(),
    };
  }

  state.saveProfile(profile);
});
