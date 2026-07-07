#!/usr/bin/env node
// hone-ctl — the state mutator behind the /hone:* slash commands.
// Slash commands run inside a Claude conversation that doesn't know its own
// session id, so session-scoped verbs (skip) act on the "current" session
// pointer, which every UserPromptSubmit hook invocation refreshes.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import * as gateLib from '../lib/gate.ts';
import * as coaching from '../lib/coaching.ts';
import * as skills from '../lib/skills.ts';
import { createDashboardServer } from '../lib/dashboard.ts';

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
    case 'wrong':
      return wrong(args);
    case 'interview':
      return interview(args);
    case 'dashboard':
      return dashboard(args);
    default:
      console.log('usage: hone-ctl <status|on|off|hint N|skip|wrong|interview [topic|stop]|dashboard [stop]>');
      return 1;
  }
}

function status(): number {
  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: process.cwd() }), runtime);
  const hone = config.hone;
  const profile = state.loadProfile();
  const counters = profile.counters ?? {
    eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0,
  };
  const sessionId = state.currentSessionId();
  const session = sessionId ? state.loadSession(sessionId) : null;
  const hint = coaching.hintRule(hone.hint_level);

  const lines: string[] = [];
  lines.push(`Hone: ${hone.enabled ? 'ON' : 'OFF'}`);
  lines.push(`Hint level: ${hone.hint_level} (${hint.name})`);
  lines.push(
    `Learning budget: ${hone.learning_budget}% — coached ${counters.coached}/${counters.eligible} eligible learning tasks`,
  );
  lines.push(
    `Gates answered: ${counters.gates_answered} · skipped: ${counters.skipped} · reflections: ${counters.reflections ?? 0}` +
      ((counters.corrections ?? 0) > 0 ? ` · corrections: ${counters.corrections}` : '') +
      ((counters.interviews ?? 0) > 0 ? ` · interviews: ${counters.interviews}` : ''),
  );
  if (session?.interview_mode) {
    lines.push(`Interview mode: ACTIVE${session.interview_topic ? ` (${session.interview_topic})` : ''} — end with /hone:interview stop`);
  }
  lines.push(
    `Current session gate: ${gateLib.describe(session)}${session?.category ? ` (${session.category})` : ''}`,
  );

  // F7: skill profile bars (directional).
  const skillEntries = Object.entries(profile.skills ?? {}).filter(([, s]) => s && s.reps > 0);
  if (skillEntries.length > 0) {
    lines.push('Skill profile (directional — reflects how you engage coaching, not test scores):');
    for (const [name, s] of skillEntries.sort((a, b) => b[1].proficiency - a[1].proficiency)) {
      const shown = skills.decayedProficiency(profile, name);
      const filled = Math.min(10, Math.max(0, Math.round(shown / 10)));
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const grad = skills.graduated(profile, name);
      const band = grad ? 'graduated 🎓 — no longer gated' : adaptiveBand(shown);
      lines.push(
        `  ${name.padEnd(20)} ${bar} ${String(Math.round(shown)).padStart(3)}  (${s.independent_reps} indep / ${s.reps} reps${band ? `, ${band}` : ''})`,
      );
    }
    if (hone.adaptive !== false) {
      lines.push('  Adaptive coaching ON — weak areas get more Socratic + bypass the budget; strong areas get more direct.');
    }
  }

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

function adaptiveBand(proficiency: number): string {
  if (proficiency < 40) return 'weak';
  if (proficiency > 70) return 'strong';
  return '';
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
  const skippedCategory = session.category;
  const wasPending = gateLib.skip(session);
  state.saveSession(sessionId, session);

  if (wasPending) {
    const profile = state.loadProfile();
    if (!profile.counters) {
      profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 };
    }
    profile.counters.skipped = (profile.counters.skipped || 0) + 1;
    // F7: skipping coaching is an "assisted" signal — the user wanted the
    // answer, not to work it — so it nudges proficiency down for that area.
    if (skippedCategory) {
      skills.recordOutcome(profile, skippedCategory, {
        independent: false,
        at: new Date().toISOString(),
      });
    }
    state.saveProfile(profile);
    console.log(
      'Solution Gate skipped for this task — Claude will implement directly. (Skips are tracked in /hone:status.)',
    );
  } else {
    console.log('No gate was pending; nothing to skip.');
  }
  return 0;
}

// /hone:wrong — the user says the last classification was wrong. Record it to
// the local labeled set and, if the mistake is currently gating them, unblock
// WITHOUT the proficiency penalty a skip would cost.
function wrong(args: string[]): number {
  const sessionId = state.currentSessionId();
  if (!sessionId) {
    console.log('No active Hone session found.');
    return 0;
  }
  const session = state.loadSession(sessionId);
  const last = session.last_classification;
  if (!last) {
    console.log('No classified prompt recorded yet in this session — nothing to report.');
    return 0;
  }

  const note = args.join(' ').trim();
  state.appendMisclassification({
    at: new Date().toISOString(),
    prompt_preview: last.prompt_preview,
    classified_as: last.intent,
    category: last.category,
    coached: last.coached,
    // What the user implies the truth was: the opposite direction.
    reported_correct_intent: last.intent === 'learning' ? 'execution' : 'learning',
    note: note || undefined,
  });

  const profile = state.loadProfile();
  if (!profile.counters) {
    profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 };
  }
  profile.counters.corrections = (profile.counters.corrections || 0) + 1;

  let unblocked = false;
  if (gateLib.isBlocking(session)) {
    gateLib.skip(session); // no recordOutcome: a misclassification is not an assist
    state.saveSession(sessionId, session);
    unblocked = true;
  }
  state.saveProfile(profile);

  console.log(
    `Recorded as misclassified (was: ${last.intent}/${last.category}) → ${state.misclassificationsPath()}` +
      (unblocked ? '\nGate unblocked — no proficiency penalty; this one was on Hone.' : ''),
  );
  return 0;
}

// /hone:interview [topic] | stop — F10.
function interview(args: string[]): number {
  const sessionId = state.currentSessionId();
  if (!sessionId) {
    console.log('No active Hone session found.');
    return 0;
  }
  const session = state.loadSession(sessionId);

  if (args[0] === 'stop') {
    if (!session.interview_mode) {
      console.log('No interview in progress.');
      return 0;
    }
    session.interview_mode = false;
    session.interview_topic = null;
    state.saveSession(sessionId, session);
    console.log('Interview ended. Back to normal coaching.');
    return 0;
  }

  const topic = args.join(' ').trim() || null;
  session.interview_mode = true;
  session.interview_topic = topic;
  // An interview supersedes any pending gate — clear it without penalty.
  if (gateLib.isBlocking(session)) gateLib.skip(session);
  state.saveSession(sessionId, session);

  const profile = state.loadProfile();
  if (!profile.counters) {
    profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 };
  }
  profile.counters.interviews = (profile.counters.interviews || 0) + 1;
  state.saveProfile(profile);

  console.log(
    `Interview mode ON${topic ? ` (topic: ${topic})` : ''} — Claude interviews you; no code gets written. End with /hone:interview stop.`,
  );
  return 0;
}

// /hone:dashboard [stop] — local skill-profile dashboard on 127.0.0.1.
function dashboard(args: string[]): number {
  const pidFile = path.join(state.honeDir(), 'dashboard.pid');

  if (args[0] === 'stop') {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
      process.kill(pid);
      fs.rmSync(pidFile, { force: true });
      console.log('Dashboard stopped.');
    } catch {
      console.log('No dashboard running.');
    }
    return 0;
  }

  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: process.cwd() }), runtime);
  const portFlag = args.indexOf('--port');
  const port = portFlag >= 0 ? parseInt(args[portFlag + 1] ?? '', 10) : config.hone.dashboard?.port ?? 4173;

  if (args.includes('--serve')) {
    // Foreground server (run detached by the default path below).
    const server = createDashboardServer();
    server.listen(Number.isInteger(port) ? port : 4173, '127.0.0.1', () => {
      const addr = server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      state.ensureDirs();
      fs.writeFileSync(pidFile, String(process.pid));
      console.log(JSON.stringify({ listening: true, url: `http://127.0.0.1:${actual}` }));
    });
    return -1; // keep the process alive
  }

  // Already running?
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    process.kill(pid, 0); // throws if dead
    console.log(`Dashboard already running: http://127.0.0.1:${port} (stop with /hone:dashboard stop)`);
    return 0;
  } catch {
    /* not running — start it */
  }

  const child = spawn(process.execPath, [process.argv[1]!, 'dashboard', '--serve', '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  console.log(`Dashboard started: http://127.0.0.1:${port} (local only; stop with /hone:dashboard stop)`);
  return 0;
}

const code = main(process.argv.slice(2));
if (code >= 0) process.exit(code);
