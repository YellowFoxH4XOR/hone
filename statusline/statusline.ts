#!/usr/bin/env node
// Opt-in statusline for Claude Code. Enable in ~/.claude/settings.json:
//   { "statusLine": { "type": "command",
//       "command": "node ~/.claude/plugins/.../hone/statusline/statusline.ts" } }
// Claude Code pipes session JSON on stdin; we print one line to stdout.

import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';

interface StatuslineStdin {
  session_id?: string;
  workspace?: { current_dir?: string };
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let stdinJson: StatuslineStdin = {};
  try {
    stdinJson = JSON.parse(input) as StatuslineStdin;
  } catch {
    // statusline must render something even on bad input
  }

  try {
    const runtime = state.loadRuntimeState();
    const config = configLib.effective(
      configLib.loadConfig({ cwd: stdinJson.workspace?.current_dir }),
      runtime,
    );
    const hone = config.hone;
    if (hone.dashboard?.statusline === false) return; // user muted it in config
    if (!hone.enabled) {
      process.stdout.write('⬡ hone off');
      return;
    }

    const profile = state.loadProfile();
    const c = profile.counters ?? { eligible: 0, coached: 0, skipped: 0, gates_answered: 0 };
    const sessionId = stdinJson.session_id || state.currentSessionId();
    const session = sessionId ? state.loadSession(sessionId) : null;
    const gateMark =
      session && session.gate === 'pending' ? ' · gate open — share your approach' : '';

    const coached = c.coached || 0;
    const eligible = c.eligible || 0;
    const pct = eligible > 0 ? Math.round((100 * coached) / eligible) : 0;

    process.stdout.write(
      `⬡ hone L${hone.hint_level} · budget ${pct}%/${hone.learning_budget}% (${coached}/${eligible})${gateMark}`,
    );
  } catch {
    process.stdout.write('⬡ hone');
  }
});
