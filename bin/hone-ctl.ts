#!/usr/bin/env node
// hone-ctl — the state mutator behind the /hone:* slash commands.
// Slash commands run inside a Claude conversation that doesn't know its own
// session id, so session-scoped verbs (skip) act on the "current" session
// pointer, which every UserPromptSubmit hook invocation refreshes.

import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import * as gateLib from '../lib/gate.ts';
import * as coaching from '../lib/coaching.ts';

function main(argv: string[]): number {
  const [verb, ...args] = argv;
  switch (verb) {
    case 'status':
      return status();
    case 'on':
      return setEnabled(true);
    case 'off':
      return setEnabled(false);
    case 'hint':
      return setHint(args[0]);
    case 'skip':
      return skip(args);
    default:
      console.log('usage: hone-ctl <status|on|off|hint N|skip>');
      return 1;
  }
}

function status(): number {
  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: process.cwd() }), runtime);
  const hone = config.hone;
  const profile = state.loadProfile();
  const counters = profile.counters ?? { eligible: 0, coached: 0, skipped: 0, gates_answered: 0 };
  const sessionId = state.currentSessionId();
  const session = sessionId ? state.loadSession(sessionId) : null;
  const hint = coaching.hintRule(hone.hint_level);

  const lines: string[] = [];
  lines.push(`Hone: ${hone.enabled ? 'ON' : 'OFF'}`);
  lines.push(`Hint level: ${hone.hint_level} (${hint.name})`);
  lines.push(
    `Learning budget: ${hone.learning_budget}% — coached ${counters.coached}/${counters.eligible} eligible learning tasks`,
  );
  lines.push(`Gates answered: ${counters.gates_answered} · skipped: ${counters.skipped}`);
  lines.push(
    `Current session gate: ${gateLib.describe(session)}${session?.category ? ` (${session.category})` : ''}`,
  );

  const cats = Object.entries(profile.categories ?? {});
  if (cats.length > 0) {
    lines.push('Per-category (eligible/coached):');
    for (const [name, c] of cats.sort((a, b) => b[1].eligible - a[1].eligible)) {
      lines.push(`  ${name}: ${c.eligible}/${c.coached}`);
    }
  }
  for (const err of config.__errors ?? []) lines.push(`Config warning: ${err}`);
  lines.push(`State dir: ${state.honeDir()}`);
  console.log(lines.join('\n'));
  return 0;
}

function setEnabled(enabled: boolean): number {
  const runtime = state.loadRuntimeState();
  runtime.enabled = enabled;
  state.saveRuntimeState(runtime);
  console.log(
    `Hone is now ${enabled ? 'ON' : 'OFF'}${enabled ? '' : ' (re-enable any time with /hone:on)'}.`,
  );
  return 0;
}

function setHint(value: string | undefined): number {
  const n = parseInt(value ?? '', 10);
  if (!Number.isInteger(n) || n < 0 || n > 5) {
    console.log('usage: hone-ctl hint <0-5>  (0 questions-only ... 5 full implementation)');
    return 1;
  }
  const runtime = state.loadRuntimeState();
  runtime.hint_level = n;
  state.saveRuntimeState(runtime);

  const profile = state.loadProfile();
  profile.hint_history = profile.hint_history ?? [];
  profile.hint_history.push({ at: new Date().toISOString(), level: n });
  if (profile.hint_history.length > 500) {
    profile.hint_history.splice(0, profile.hint_history.length - 500);
  }
  state.saveProfile(profile);

  console.log(`Hint level set to ${n} (${coaching.hintRule(n).name}).`);
  return 0;
}

function skip(args: string[]): number {
  const flagIdx = args.indexOf('--session');
  const sessionId = flagIdx >= 0 ? args[flagIdx + 1] : state.currentSessionId();
  if (!sessionId) {
    console.log('No active Hone session found — nothing to skip.');
    return 0;
  }
  const session = state.loadSession(sessionId);
  const wasPending = gateLib.skip(session);
  state.saveSession(sessionId, session);

  if (wasPending) {
    const profile = state.loadProfile();
    if (!profile.counters) {
      profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0 };
    }
    profile.counters.skipped = (profile.counters.skipped || 0) + 1;
    state.saveProfile(profile);
    console.log(
      'Solution Gate skipped for this task — Claude will implement directly. (Skips are tracked in /hone:status.)',
    );
  } else {
    console.log('No gate was pending; nothing to skip.');
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
