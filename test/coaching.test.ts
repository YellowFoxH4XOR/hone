import { test } from 'node:test';
import assert from 'node:assert';
import * as coaching from '../lib/coaching.ts';

// These templates are the product's actual coaching copy. The assertions below
// pin two things the rewrite is responsible for: (1) autonomy-supportive gate
// framing (rationale + genuine /hone:skip choice, per Deci et al. 1994), and
// (2) an explicit correctness verdict before critique on coached turns and in
// auto-feedback (the consolidation step, per Sinha & Kapur 2021). The
// literal substrings other tests depend on are re-asserted here so a future
// reword can't silently drop them.

test('gateContext keeps the load-bearing phrase and is autonomy-supportive', () => {
  const ctx = coaching.gateContext({ category: 'concurrency', hintLevel: 0 });
  // Preserved: asserted verbatim by test/hooks.test.ts.
  assert.ok(ctx.includes('Solution Gate is ACTIVE'));
  assert.ok(ctx.includes('/hone:skip'));
  // New: leads with a rationale for the pause, not a bare rule.
  assert.match(ctx, /why the pause is worth it/i);
  // New: skip is framed as a first-class choice, not a grudging afterthought.
  assert.match(ctx, /first-class option/i);
});

test('gateDenyReason keeps /hone:skip and frames skipping as legitimate', () => {
  const reason = coaching.gateDenyReason({ category: 'security' });
  assert.ok(reason.includes('/hone:skip')); // preserved for hooks.test.ts
  assert.ok(reason.includes('security'));
  assert.match(reason, /first-class choice/i);
  // Still forbids Claude self-skipping.
  assert.match(reason, /USER's decision only/);
});

test('coachingContext requires a plain verdict before critique', () => {
  const ctx = coaching.coachingContext({ category: 'architecture', hintLevel: 1 });
  assert.ok(ctx.includes('Gate is now open')); // preserved for hooks.test.ts
  // The verdict must come FIRST — index of "verdict" precedes index of "risky".
  const verdictIdx = ctx.toLowerCase().indexOf('verdict');
  const riskyIdx = ctx.toLowerCase().indexOf('risky');
  assert.ok(verdictIdx >= 0, 'must instruct a verdict');
  assert.ok(riskyIdx >= 0);
  assert.ok(verdictIdx < riskyIdx, 'verdict must be required before the risk critique');
});

test('autoFeedbackContext requires an opening correctness verdict', () => {
  const ctx = coaching.autoFeedbackContext({ category: 'debugging', reviewOnly: true });
  assert.ok(ctx.includes('senior-lens review')); // preserved for hooks.test.ts
  assert.match(ctx, /verdict/i);
  // The verdict is required to lead; the softer "what I would check" framing is
  // scoped to the details, so it must appear AFTER the verdict instruction.
  const verdictIdx = ctx.toLowerCase().indexOf('verdict');
  const checkIdx = ctx.indexOf('here is what I would check');
  assert.ok(verdictIdx >= 0 && checkIdx >= 0);
  assert.ok(verdictIdx < checkIdx);
  // reviewOnly still suppresses silent rewrites.
  assert.match(ctx, /Do not silently change/);
});
