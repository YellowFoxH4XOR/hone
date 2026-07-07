#!/usr/bin/env node
// UserPromptSubmit — the heart of Hone (F1 router + budget, F2 gate driver).
//
// On every prompt:
//   gate pending?  -> this prompt is the user's answer: open the gate, inject
//                     hint-level coaching instructions.
//   otherwise      -> classify; if learning + within budget, set the gate to
//                     pending and inject Solution Gate instructions.
//   anything else  -> exit silently; vanilla Claude Code.

import { emit, run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import { classify } from '../lib/classifier.ts';
import * as budget from '../lib/budget.ts';
import * as gate from '../lib/gate.ts';
import * as coaching from '../lib/coaching.ts';

function inject(text: string): void {
  emit({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: text,
    },
  });
}

run(async (input) => {
  const sessionId = input.session_id;
  // Field is `prompt` in the shipped schema; some doc revisions say
  // `user_input` — accept both so a rename never silently disables Hone.
  const prompt = String(input.prompt ?? input.user_input ?? '');

  // Keep the "current session" pointer fresh so /hone:skip can find us.
  state.touchCurrentSession(sessionId);

  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: input.cwd }), runtime);
  if (!config.hone.enabled) return;

  // Slash commands (including /hone:*) manage their own behavior.
  if (prompt.trimStart().startsWith('/')) return;

  const session = state.loadSession(sessionId);

  // The user is answering an open Solution Gate.
  if (gate.isBlocking(session)) {
    gate.markAnswered(session);
    state.saveSession(sessionId, session);

    const profile = state.loadProfile();
    if (!profile.counters) {
      profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0 };
    }
    profile.counters.gates_answered = (profile.counters.gates_answered || 0) + 1;
    state.saveProfile(profile);

    inject(
      coaching.coachingContext({
        category: session.category || 'learning',
        hintLevel: config.hone.hint_level,
        reviewOnly: config.hone.review_only !== false,
      }),
    );
    return;
  }

  // Fresh prompt: route it.
  const classification = classify(prompt);
  if (classification.passthrough || classification.intent !== 'learning') return;

  const profile = state.loadProfile();
  const decision = budget.decide({ classification, config, profile });
  // decide() mutated eligibility counters — persist them whenever they changed.
  if (
    !['disabled', 'execution-task', 'never-coach-category', 'hint-level-5-vanilla'].includes(
      decision.reason,
    )
  ) {
    state.saveProfile(profile);
  }
  if (!decision.coach) return;

  gate.open(session, { category: decision.category, prompt });
  state.saveSession(sessionId, session);

  inject(
    coaching.gateContext({
      category: decision.category,
      hintLevel: config.hone.hint_level,
    }),
  );
});
