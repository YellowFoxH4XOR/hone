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
//
// Framing is autonomy-supportive on purpose: a hard gate is need-thwarting
// (Bartholomew et al. 2011), so the copy leads with a RATIONALE, acknowledges
// the friction, and treats /hone:skip as a genuine choice rather than a
// grudging escape hatch. Deci, Eghrari, Patrick & Leone (1994) found exactly
// that combination — rationale + acknowledgement + choice-framing — is what
// makes an imposed task get internalized instead of resented.
export function gateContext(opts: { category: string; hintLevel: number }): string {
  const hint = hintRule(opts.hintLevel);
  return [
    '<hone-coaching>',
    `Hone: this request is a coached learning task (category: ${opts.category}). The Solution Gate is ACTIVE.`,
    'For THIS reply only:',
    '1. Lead with one plain sentence on why the pause is worth it: putting your own approach into words first is what keeps the skill yours — a deliberate ~30-second trade, not a hoop to clear.',
    '2. Do not write, edit, or generate any code, pseudocode, or file changes yet — file-editing tools are blocked until the user responds.',
    '3. Ask for their proposed approach: at most 3 short, targeted questions probing the decisions that actually matter for this task (invariants, failure modes, tradeoffs). Fewer is better.',
    '4. Tone: a sharp senior peer thinking alongside them — never a quiz, a lecture, or a scold, and never imply they are cutting corners.',
    `5. After they answer, you will coach at hint level ${opts.hintLevel} (${hint.name}).`,
    'Genuinely their call: if they would rather just get the code this time, /hone:skip is a first-class option and not a failure; if Hone misclassified this (it is not really a learning task), /hone:wrong records it and unblocks. Offer both plainly, not as a grudging afterthought.',
    '</hone-coaching>',
  ].join('\n');
}

// F10 interview mode: injected on every prompt while a session is in
// interview mode. Claude becomes the interviewer, not the assistant.
export function interviewContext(opts: { topic?: string | null }): string {
  const topic = opts.topic ? ` Focus area: ${opts.topic}.` : '';
  return [
    '<hone-interview>',
    `Hone INTERVIEW MODE is active.${topic} You are the interviewer — a sharp, fair senior engineer running a technical interview. Until the user runs /hone:interview stop:`,
    '- Never write, edit, or generate code or solutions. File-editing tools are blocked.',
    '- Probe their understanding: ask them to explain their code, defend design decisions, walk through failure modes, estimate complexity, and consider alternatives.',
    '- One question at a time. Follow up on weak or vague answers instead of moving on — that is where the learning is.',
    '- Be direct in your evaluations: if an answer is wrong or incomplete, say so and ask a follow-up that lets them correct it themselves.',
    '- Stay on topic; do not solve the problem for them, even if asked. If they want out, they can run /hone:interview stop.',
    '</hone-interview>',
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
    '- FIRST, give a plain verdict on their approach: is it right, partially right, or heading wrong? Name what is genuinely sound before anything else. Lead with this consolidation — a critique that never says whether they were right just reads as more withholding, and the struggle only pays off once it is resolved.',
    '- THEN: what is risky or what they have not considered (edge cases, failure modes, concurrency, cost).',
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
    'Rather than edit files, ask the user (max 3 short questions) how they would approach it, then wait — putting their own approach into words first is the point of the pause, not a formality. ' +
    "If they would rather just get the code this time, /hone:skip is theirs to run and a first-class choice — skipping is the USER's decision only; never invoke it or run hone-ctl yourself."
  );
}

// F5 auto-feedback: injected after code is written during a coached task.
// The point is teaching-through-review, not silent correction.
export function autoFeedbackContext(opts: { category: string; reviewOnly: boolean }): string {
  const lines = [
    '<hone-coaching>',
    `Hone: code was just written during a coached ${opts.category} task. Before moving on, give the user a brief senior-lens review so they learn what to look for:`,
    '- OPEN with a plain one-line verdict: does this look correct as written, correct-but-watch-X, or likely wrong because Y? Say it directly — a review that never lands a verdict leaves the struggle unresolved (Kapur\'s "unproductive failure"), no better than being handed the answer.',
    '- Then 2-4 lines, not a rewrite: name the edge cases, failure modes, or assumptions worth a second look here specifically. For those specifics, frame as "here is what I would check", not a verdict on each.',
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
      'Commands: /hone:status, /hone:hint N, /hone:budget N, /hone:reflection off|optional|on, /hone:skip, /hone:wrong, /hone:interview, /hone:dashboard, /hone:off.',
    '</hone-status>',
  ].join('\n');
}
