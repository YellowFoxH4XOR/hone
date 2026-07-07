// F3 Hint Levels + F4 Socratic coaching text. These strings are injected as
// context on coached turns only — they are the token cost of the product, so
// they stay terse (the Learning Budget caps how often they're paid at all).

import type { HintRule } from './types.ts';

export const HINT_LEVELS: Record<number, HintRule> = {
  0: {
    name: 'questions only',
    rule: 'Ask guiding questions only. Reveal no approaches, no concepts by name, no code.',
  },
  1: {
    name: 'small nudges',
    rule: 'Point toward the relevant concept, doc, or area of the code. No solutions, no code.',
  },
  2: {
    name: 'high-level ideas',
    rule: 'Outline viable approaches and their tradeoffs in prose. No code, no pseudocode.',
  },
  3: {
    name: 'pseudocode',
    rule: 'Pseudocode and sketches are allowed. No runnable code.',
  },
  4: {
    name: 'partial implementation',
    rule: 'Provide skeletons and the hardest fragments; leave meaningful parts for the user to complete, marked with TODO(you).',
  },
  5: {
    name: 'full implementation',
    rule: 'No coaching constraints (vanilla Claude Code).',
  },
};

export function hintRule(level: number): HintRule {
  return HINT_LEVELS[level] ?? HINT_LEVELS[1]!;
}

// Injected when the Solution Gate opens: Claude must elicit the user's
// approach before any implementation.
export function gateContext(opts: { category: string; hintLevel: number }): string {
  const hint = hintRule(opts.hintLevel);
  return [
    '<hone-coaching>',
    `Hone: this request is a coached learning task (category: ${opts.category}). The Solution Gate is ACTIVE.`,
    'For THIS reply only:',
    '1. Do not write, edit, or generate any code, pseudocode, or file changes — file-editing tools are blocked until the user responds.',
    '2. Ask the user for their proposed approach first: at most 3 short, targeted questions probing the decisions that actually matter for this task (invariants, failure modes, tradeoffs). Fewer is better.',
    '3. Tone: a sharp senior peer thinking alongside them — not a quiz or a lecture. One short sentence of setup at most.',
    `4. After they answer, you will coach at hint level ${opts.hintLevel} (${hint.name}).`,
    'If the user would rather skip coaching for this task, they can run /hone:skip — mention this once, briefly, at the end.',
    '</hone-coaching>',
  ].join('\n');
}

// Injected on the prompt AFTER the user answers the gate.
export function coachingContext(opts: {
  category: string;
  hintLevel: number;
  reviewOnly?: boolean;
}): string {
  const hint = hintRule(opts.hintLevel);
  const lines = [
    '<hone-coaching>',
    `Hone: the user just responded to the Solution Gate for a coached ${opts.category} task. Gate is now open.`,
    `Hint level ${opts.hintLevel} (${hint.name}): ${hint.rule}`,
    'Coach like a senior peer reviewing their thinking:',
    '- Briefly assess their approach: what is sound, what is risky, what they have not considered (edge cases, failure modes, concurrency, cost).',
    '- At most 3 Socratic questions per turn, and only where a question sharpens their thinking more than a statement would.',
  ];
  if (opts.reviewOnly !== false) {
    lines.push('- Never rewrite code they wrote unless they ask; explain the why and let them make the change.');
  }
  lines.push(
    '- If they explicitly ask for the full implementation, comply without lecturing — and mention /hone:hint 5 or /hone:skip once so they know the dial exists.',
    '</hone-coaching>',
  );
  return lines.join('\n');
}

// PreToolUse deny reason while the gate is pending. This is shown to Claude,
// so it doubles as an instruction for what to do instead.
export function gateDenyReason(session: { category?: string | null } | null | undefined): string {
  const category = session?.category || 'learning';
  return (
    `Hone Solution Gate: this is a coached ${category} task and the user has not shared their approach yet. ` +
    'Do not modify files. Instead, ask the user (max 3 short questions) how they would approach it, then wait. ' +
    "The user can bypass with /hone:skip — skipping is the USER's decision only; never invoke it or run hone-ctl yourself."
  );
}

// F5 auto-feedback: injected after code is written during a coached task.
// The point is teaching-through-review, not silent correction.
export function autoFeedbackContext(opts: { category: string; reviewOnly: boolean }): string {
  const lines = [
    '<hone-coaching>',
    `Hone: code was just written during a coached ${opts.category} task. Before moving on, give the user a brief senior-lens review so they learn what to look for:`,
    '- 2-4 lines, not a rewrite: name the edge cases, failure modes, or assumptions worth a second look here specifically.',
    '- Frame it as "here is what I would check", not "here is what is wrong".',
    '- End with one question that makes them pressure-test the code themselves.',
  ];
  if (opts.reviewOnly) {
    lines.push('- Do not silently change the code you just wrote in the name of the review; if a change is warranted, tell them what and why and let them decide.');
  }
  lines.push('</hone-coaching>');
  return lines.join('\n');
}

// F6 reflection: the Stop-hook block reason. Making Claude ask the user to
// recap consolidates the learning; it fires at most once per coached session.
export function reflectionPrompt(opts: { category: string }): string {
  return [
    '<hone-reflection>',
    `Hone: a coached ${opts.category} task just wrapped. Before ending, ask a brief reflection to consolidate the learning:`,
    'Ask the user, warmly and briefly, 1-2 of these — whichever fit what they just did:',
    '- What was the hardest part, and what finally made it click?',
    '- What would you do differently if you hit this again?',
    '- In one or two sentences, explain the solution back without looking.',
    'Keep it to a couple of sentences of framing.',
    '</hone-reflection>',
  ].join('\n');
}

// SessionStart: one terse line of standing context so Claude knows Hone
// exists and where the dials are. Deliberately does not change behavior on
// uncoached turns.
export function sessionStartContext(opts: {
  enabled: boolean;
  hintLevel: number;
  budget: number;
  coached: number;
  eligible: number;
}): string {
  if (!opts.enabled) return '';
  const ratio =
    opts.eligible > 0
      ? `${opts.coached}/${opts.eligible} learning tasks coached`
      : 'no coached tasks yet';
  return [
    '<hone-status>',
    `Hone is active (learning budget ${opts.budget}%, hint level ${opts.hintLevel}, ${ratio}). ` +
      'Most requests pass through untouched. When a turn includes <hone-coaching> instructions, follow them exactly. ' +
      'Commands: /hone:status, /hone:hint N, /hone:skip, /hone:off.',
    '</hone-status>',
  ].join('\n');
}
