#!/usr/bin/env node
// Stop — Stage 0 stub. Records liveness for the profile; Stage 1 will grow
// this into reflection prompts (F6) and transcript-based metric extraction
// (F8). Kept deliberately tiny so ending a turn stays instant.

import { run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';

run(async () => {
  const profile = state.loadProfile();
  profile.last_active_at = new Date().toISOString();
  state.saveProfile(profile);
});
