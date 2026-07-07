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
import * as skills from '../lib/skills.ts';

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
  const category = session.category || 'learning';

  // F10: interview mode owns every prompt until /hone:interview stop.
  if (session.interview_mode) {
    inject(coaching.interviewContext({ topic: session.interview_topic }));
    return;
  }

  // The user is answering an open Solution Gate.
  if (gate.isBlocking(session)) {
    gate.markAnswered(session);
    state.saveSession(sessionId, session);

    const profile = state.loadProfile();
    if (!profile.counters) {
      profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 };
    }
    profile.counters.gates_answered = (profile.counters.gates_answered || 0) + 1;

    // F7: answering the gate at a low hint level counts as working it
    // independently; leaning on a high hint level counts as assisted.
    const baseHint = config.hone.hint_level;
    const independent = baseHint <= skills.INDEPENDENT_HINT_CEILING;
    if (session.category) {
      skills.recordOutcome(profile, session.category, {
        independent,
        at: new Date().toISOString(),
      });
    }
    state.saveProfile(profile);

    // F7 adaptive: bend the hint level toward the user's proficiency here.
    const adj = skills.adaptiveAdjustment(profile, category, {
      adaptive: config.hone.adaptive !== false,
    });
    const hintLevel = skills.effectiveHint(baseHint, adj.hintDelta);

    inject(
      coaching.coachingContext({
        category,
        hintLevel,
        reviewOnly: config.hone.review_only !== false,
      }),
    );
    return;
  }

  // Fresh prompt: route it.
  const classification = classify(prompt);

  // Record the routed classification so /hone:wrong can report it (both
  // directions: false-coach and missed-learning).
  const recordLast = (coached: boolean): void => {
    session.last_classification = {
      prompt_preview: prompt.slice(0, 140),
      intent: classification.intent,
      category: classification.category,
      coached,
      at: new Date().toISOString(),
    };
  };

  if (classification.passthrough) return;
  if (classification.intent !== 'learning') {
    recordLast(false);
    state.saveSession(sessionId, session);
    return;
  }

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
  if (!decision.coach) {
    recordLast(false);
    state.saveSession(sessionId, session);
    return;
  }

  gate.open(session, { category: decision.category, prompt });
  // F5: a fresh coached task — allow one auto-feedback pass again.
  session.feedback_given = false;
  recordLast(true);
  state.saveSession(sessionId, session);

  // F7 adaptive: weak areas get more Socratic questioning up front.
  const adj = skills.adaptiveAdjustment(profile, decision.category, {
    adaptive: config.hone.adaptive !== false,
  });
  inject(
    coaching.gateContext({
      category: decision.category,
      hintLevel: skills.effectiveHint(config.hone.hint_level, adj.hintDelta),
    }),
  );
});
