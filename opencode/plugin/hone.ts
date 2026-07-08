// Hone for OpenCode — the same behavioral layer Hone gives Claude Code, ported
// to OpenCode's plugin API. It reuses Hone's entire platform-agnostic core
// (`lib/`: classifier, budget, gate, coaching, skills, config, state); this
// file is only the adapter that maps OpenCode's hooks to that core.
//
// Hook mapping (Claude Code -> OpenCode):
//   UserPromptSubmit (classify + gate + inject) -> chat.message
//   PreToolUse (deny edits while gated)          -> tool.execute.before (throw)
//   PostToolUse (auto-feedback)                  -> tool.execute.after
//   SessionStart (status + deferred reflection)  -> first chat.message of a session
//   Stop (queue reflection)                      -> event: session.idle
//
// PRIME DIRECTIVE (same as the Claude hooks): FAIL OPEN. Every hook body is
// wrapped so any error — corrupt state, bad config — becomes a no-op. A
// coaching plugin must never be the reason a developer can't work.

import type {
  Plugin,
  Part,
  PluginEvent,
  ChatMessageInput,
  ChatMessageOutput,
  ToolExecuteBeforeInput,
  ToolExecuteBeforeOutput,
  ToolExecuteAfterInput,
  ToolExecuteAfterOutput,
} from './opencode-types.ts';
import * as state from '../../lib/state.ts';
import * as configLib from '../../lib/config.ts';
import { classify } from '../../lib/classifier.ts';
import * as budget from '../../lib/budget.ts';
import * as gate from '../../lib/gate.ts';
import * as coaching from '../../lib/coaching.ts';
import * as skills from '../../lib/skills.ts';
import { isFileWritingBash } from '../../lib/bashwrite.ts';

// OpenCode's file-writing tools (parallel to Claude's Write/Edit/NotebookEdit).
const WRITE_TOOLS = new Set(['write', 'edit', 'patch', 'multiedit']);

function promptText(parts: Part[]): string {
  return parts
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('\n')
    .trim();
}

function sessionIdOf(event: PluginEvent): string | null {
  return (
    event.properties?.sessionID ??
    event.properties?.session_id ??
    event.sessionID ??
    event.session_id ??
    null
  );
}

// Everything the model-facing SessionStart context does in Claude Code, folded
// into the first user message of an OpenCode session (event hooks can't inject
// into the prompt; the first chat.message can). Mutates the profile if it
// surfaces a queued reflection. Returns the text to inject, or ''.
function sessionStartText(config: ReturnType<typeof configLib.effective>): string {
  const profile = state.loadProfile();
  const counters = profile.counters ?? {
    eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0,
  };
  let text = coaching.sessionStartContext({
    enabled: true,
    hintLevel: config.hone.hint_level,
    budget: config.hone.learning_budget,
    coached: counters.coached || 0,
    eligible: counters.eligible || 0,
  });
  if (!text) return '';

  const errors = config.__errors ?? [];
  if (errors.length > 0) {
    text += `\nHone config warning (defaults are active — mention this to the user once): ${errors.join('; ')}`;
  }

  // F6 deferred reflection: surface (and consume) a reflection queued by a prior
  // coached session; increment the counter here, when it actually happens.
  let dirty = false;
  const pending = profile.pending_reflection;
  if (config.hone.reflection !== 'off' && pending && pending.category) {
    text += '\n' + coaching.deferredReflectionContext({ category: pending.category });
    profile.pending_reflection = null;
    if (!profile.counters) {
      profile.counters = { eligible: 0, coached: 0, skipped: 0, gates_answered: 0, reflections: 0 };
    }
    profile.counters.reflections = (profile.counters.reflections || 0) + 1;
    dirty = true;
  }

  const stale = skills.staleSkills(profile);
  if (stale.length > 0) text += '\n' + coaching.stalenessNudge({ category: stale[0]!.category });

  if (dirty) state.saveProfile(profile);
  return text;
}

export const HonePlugin: Plugin = async ({ directory } = {}) => {
  return {
    // classify + budget + Solution Gate, and inject coaching context.
    'chat.message': async (input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
      try {
        const sessionId = input.sessionID;
        const prompt = promptText(output.parts);
        // Slash-command expansions and empty turns: leave alone.
        if (!prompt || prompt.startsWith('/')) return;

        state.touchCurrentSession(sessionId);
        const runtime = state.loadRuntimeState();
        const config = configLib.effective(configLib.loadConfig({ cwd: directory }), runtime);
        if (!config.hone.enabled) return;

        const inject: string[] = [];
        const session = state.loadSession(sessionId);

        // First message of a session: housekeeping + the SessionStart context.
        if (!session.started) {
          state.ensureDirs();
          configLib.ensureDefaultConfigFile();
          state.gcSessions(7);
          session.started = true;
          const startText = sessionStartText(config);
          if (startText) inject.push(startText);
        }

        const category = session.category || 'learning';

        if (session.interview_mode) {
          inject.push(coaching.interviewContext({ topic: session.interview_topic }));
          state.saveSession(sessionId, session);
          if (inject.length) output.parts.push({ type: 'text', text: inject.join('\n') });
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

          const baseHint = config.hone.hint_level;
          if (session.category && skills.isSubstantiveAnswer(prompt)) {
            const independent = baseHint <= skills.INDEPENDENT_HINT_CEILING;
            skills.recordOutcome(profile, session.category, {
              independent,
              at: new Date().toISOString(),
            });
          }
          state.saveProfile(profile);

          const adj = skills.adaptiveAdjustment(profile, category, {
            adaptive: config.hone.adaptive !== false,
          });
          inject.push(
            coaching.coachingContext({
              category,
              hintLevel: skills.coachingHint(profile, category, baseHint, adj.hintDelta),
              reviewOnly: config.hone.review_only !== false,
            }),
          );
          output.parts.push({ type: 'text', text: inject.join('\n') });
          return;
        }

        // Fresh prompt: route it.
        const classification = classify(prompt);
        const recordLast = (coached: boolean): void => {
          session.last_classification = {
            prompt_preview: prompt.slice(0, 140),
            intent: classification.intent,
            category: classification.category,
            coached,
            at: new Date().toISOString(),
          };
        };

        if (classification.passthrough) {
          state.saveSession(sessionId, session);
          if (inject.length) output.parts.push({ type: 'text', text: inject.join('\n') });
          return;
        }
        if (classification.intent !== 'learning') {
          recordLast(false);
          state.saveSession(sessionId, session);
          if (inject.length) output.parts.push({ type: 'text', text: inject.join('\n') });
          return;
        }

        const profile = state.loadProfile();
        const decision = budget.decide({ classification, config, profile });
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
          if (inject.length) output.parts.push({ type: 'text', text: inject.join('\n') });
          return;
        }

        gate.open(session, { category: decision.category, prompt });
        session.feedback_given = false; // a fresh coached task — allow feedback again
        recordLast(true);
        state.saveSession(sessionId, session);

        const adj = skills.adaptiveAdjustment(profile, decision.category, {
          adaptive: config.hone.adaptive !== false,
        });
        inject.push(
          coaching.gateContext({
            category: decision.category,
            hintLevel: skills.coachingHint(profile, decision.category, config.hone.hint_level, adj.hintDelta),
          }),
        );
        output.parts.push({ type: 'text', text: inject.join('\n') });
      } catch {
        /* fail open */
      }
    },

    // Enforcement: block file edits while the gate is pending (or interviewing).
    'tool.execute.before': async (
      input: ToolExecuteBeforeInput,
      output: ToolExecuteBeforeOutput,
    ): Promise<void> => {
      try {
        const runtime = state.loadRuntimeState();
        const config = configLib.effective(configLib.loadConfig({ cwd: directory }), runtime);
        if (!config.hone.enabled) return;

        const session = state.loadSession(input.sessionID);
        const interviewing = session.interview_mode === true;
        if (!gate.isBlocking(session) && !interviewing) return;

        const reason = interviewing
          ? 'Hone interview mode: no code is written during an interview — keep questioning. The user can end it with /hone:interview stop.'
          : coaching.gateDenyReason(session);

        const tool = String(input.tool ?? '').toLowerCase();
        if (WRITE_TOOLS.has(tool)) throw new Error(reason);

        if (tool === 'bash') {
          const command = String(output.args?.command ?? '');
          if (command.includes('hone-ctl')) return; // escape hatch always works
          if (isFileWritingBash(command)) throw new Error(reason);
        }
      } catch (err) {
        // A thrown error here is the DENY signal — re-throw it. Anything else
        // (state/config failure) must fail open.
        if (err instanceof Error && err.message.startsWith('Hone')) throw err;
      }
    },

    // F5 auto-feedback: after code is written during a coached task, append a
    // senior-lens review to the tool result the model reads (OpenCode's
    // in-turn injection point). Once per task, coached sessions only.
    'tool.execute.after': async (
      input: ToolExecuteAfterInput,
      output: ToolExecuteAfterOutput,
    ): Promise<void> => {
      try {
        const tool = String(input.tool ?? '').toLowerCase();
        if (!WRITE_TOOLS.has(tool)) return;

        const runtime = state.loadRuntimeState();
        const config = configLib.effective(configLib.loadConfig({ cwd: directory }), runtime);
        if (!config.hone.enabled || config.hone.autofeedback === false) return;

        const session = state.loadSession(input.sessionID);
        if (session.gate !== 'answered' || session.feedback_given) return;

        session.feedback_given = true;
        state.saveSession(input.sessionID, session);

        const feedback = coaching.autoFeedbackContext({
          category: session.category || 'learning',
          reviewOnly: config.hone.review_only !== false,
        });
        output.output = `${output.output}\n\n${feedback}`;
      } catch {
        /* fail open */
      }
    },

    // Stop analog: when the session goes idle after coached work, QUEUE a
    // reflection for the next session start (mirrors hooks/stop.ts).
    event: async ({ event }: { event: PluginEvent }): Promise<void> => {
      try {
        if (event.type !== 'session.idle') return;
        const sessionId = sessionIdOf(event);
        if (!sessionId) return;

        const runtime = state.loadRuntimeState();
        const config = configLib.effective(configLib.loadConfig({ cwd: directory }), runtime);
        const session = state.loadSession(sessionId);

        const profile = state.loadProfile();
        profile.last_active_at = new Date().toISOString();
        if (config.hone.enabled && config.hone.reflection !== 'off' && session.gate === 'answered') {
          profile.pending_reflection = {
            category: session.category || 'learning',
            at: new Date().toISOString(),
          };
        }
        state.saveProfile(profile);
      } catch {
        /* fail open */
      }
    },
  };
};

export default HonePlugin;
