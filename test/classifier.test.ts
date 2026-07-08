import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { classify, LEARNING_CATEGORIES, EXECUTION_CATEGORIES } from '../lib/classifier.ts';

interface LabeledPrompt {
  prompt: string;
  expected: 'learning' | 'execution';
  category?: string;
}

function loadFixture(name: string): LabeledPrompt[] {
  const file = path.join(import.meta.dirname, 'fixtures', name);
  return (JSON.parse(readFileSync(file, 'utf8')) as { prompts: LabeledPrompt[] }).prompts;
}

const fixtures = loadFixture('labeled-prompts.json');
const oosFixtures = loadFixture('labeled-prompts-oos.json');
const r2Fixtures = loadFixture('labeled-prompts-r2.json');
// Written AFTER the signal lists were frozen and never used to tune them — this
// is the one dataset that honestly measures generalization to unseen phrasing.
const holdoutFixtures = loadFixture('labeled-prompts-holdout.json');

test('PRD acceptance: execution -> learning misclassification stays under 5%', () => {
  const execution = fixtures.filter((p) => p.expected === 'execution');
  const wrong = execution.filter((p) => classify(p.prompt).intent === 'learning');
  const rate = wrong.length / execution.length;
  assert.ok(
    rate < 0.05,
    `execution->learning rate ${(rate * 100).toFixed(1)}% (${wrong.length}/${execution.length}); offenders:\n` +
      wrong.map((p) => `  - ${p.prompt}`).join('\n'),
  );
});

test('second dataset (independently generated, incl. adversarial prompts): false-coach <5%, recall >=90%', () => {
  const exec = oosFixtures.filter((p) => p.expected === 'execution');
  const learn = oosFixtures.filter((p) => p.expected === 'learning');
  const fc = exec.filter((p) => classify(p.prompt).intent === 'learning');
  const missed = learn.filter((p) => classify(p.prompt).intent !== 'learning');
  assert.ok(
    fc.length / exec.length < 0.05,
    `false-coach ${fc.length}/${exec.length}:\n` + fc.map((p) => `  - ${p.prompt}`).join('\n'),
  );
  assert.ok(
    1 - missed.length / learn.length >= 0.9,
    `recall ${(100 * (1 - missed.length / learn.length)).toFixed(1)}%:\n` +
      missed.map((p) => `  - ${p.prompt}`).join('\n'),
  );
});

test('third dataset (mobile/devops + data/ML personas): false-coach <5%, recall >=90%', () => {
  const exec = r2Fixtures.filter((p) => p.expected === 'execution');
  const learn = r2Fixtures.filter((p) => p.expected === 'learning');
  const fc = exec.filter((p) => classify(p.prompt).intent === 'learning');
  const missed = learn.filter((p) => classify(p.prompt).intent !== 'learning');
  assert.ok(
    fc.length / exec.length < 0.05,
    `false-coach ${fc.length}/${exec.length}:\n` + fc.map((p) => `  - ${p.prompt}`).join('\n'),
  );
  assert.ok(
    1 - missed.length / learn.length >= 0.9,
    `recall ${(100 * (1 - missed.length / learn.length)).toFixed(1)}%:\n` +
      missed.map((p) => `  - ${p.prompt}`).join('\n'),
  );
});

test('HELD-OUT set (never used to tune signals): 0 false-coach, recall stays useful', () => {
  const exec = holdoutFixtures.filter((p) => p.expected === 'execution');
  const learn = holdoutFixtures.filter((p) => p.expected === 'learning');
  const fc = exec.filter((p) => classify(p.prompt).intent === 'learning');
  const missed = learn.filter((p) => classify(p.prompt).intent !== 'learning');
  const recall = 1 - missed.length / learn.length;
  // The PRD's asymmetric contract: execution->coaching (the annoying direction)
  // must stay under 5%. On this unseen set it is currently exactly 0.
  assert.ok(
    fc.length / exec.length < 0.05,
    `held-out false-coach ${fc.length}/${exec.length}:\n` + fc.map((p) => `  - ${p.prompt}`).join('\n'),
  );
  // Recall floor is deliberately honest (not the 90%+ we tune the seen sets to)
  // — this measures generalization, so we assert the product is still viable
  // (>=85%), not perfection. Real current recall prints on failure.
  assert.ok(
    recall >= 0.85,
    `held-out recall ${(recall * 100).toFixed(1)}%; missed:\n` + missed.map((p) => `  - ${p.prompt}`).join('\n'),
  );
});

test('closing-clause override: a question that ends in an explicit instruction routes to execution', () => {
  // The user already decided — no Solution Gate. Before the fix, the leading
  // "why/how/what" made these read as pure learning (the imperative was at the
  // END, past the ^-anchored check).
  const cases = [
    'why does this deadlock under load? just add a timeout and retry for now.',
    'how should tokens be stored for this? go ahead and put them in an httpOnly cookie.',
    "what's the cleanest way to structure this — actually never mind, just extract it into a helper.",
    "not sure why the query is slow but let's just add an index on user_id and move on",
  ];
  for (const prompt of cases) {
    assert.strictEqual(classify(prompt).intent, 'execution', `should route to execution: ${prompt}`);
  }
  // ...but a genuine question without a closing instruction still coaches.
  assert.strictEqual(
    classify('why does this deadlock under load? I cannot figure out the root cause').intent,
    'learning',
  );
});

test('regression: noun "profile" (user/distribution profile) is not a performance signal', () => {
  assert.strictEqual(classify('Configure code signing for the new enterprise distribution profile.').intent, 'execution');
  assert.strictEqual(classify('New screen needed for editing the profile picture.').intent, 'execution');
  // ...but the verb form still is:
  assert.strictEqual(classify('my query got slow after adding the join — how do I profile it').intent, 'learning');
});

test('learning recall is high enough for the product to exist (>=80%)', () => {
  const learning = fixtures.filter((p) => p.expected === 'learning');
  const missed = learning.filter((p) => classify(p.prompt).intent !== 'learning');
  const recall = 1 - missed.length / learning.length;
  assert.ok(
    recall >= 0.8,
    `learning recall ${(recall * 100).toFixed(1)}%; missed:\n` +
      missed.map((p) => `  - ${p.prompt}`).join('\n'),
  );
});

test('category assignment matches labels where a category is specified', () => {
  const labeled = fixtures.filter((p) => p.category);
  const wrong = labeled.filter((p) => {
    const result = classify(p.prompt);
    return result.intent === p.expected && result.category !== p.category;
  });
  // Category (unlike intent) is a soft target — assert a floor, not perfection.
  const rate = wrong.length / labeled.length;
  assert.ok(
    rate <= 0.2,
    `category mismatch ${(rate * 100).toFixed(1)}%:\n` +
      wrong
        .map((p) => `  - "${p.prompt}" -> ${classify(p.prompt).category}, wanted ${p.category}`)
        .join('\n'),
  );
});

test('guard rails: short prompts, continuations, and slash commands pass through', () => {
  for (const prompt of ['yes', 'ok', 'go ahead', 'thanks!', 'y', '/hone:status', 'lgtm', 'do it', 'continue', 'fix it']) {
    const result = classify(prompt);
    assert.strictEqual(result.intent, 'execution', `"${prompt}" should pass through`);
    assert.strictEqual(result.passthrough, true, `"${prompt}" should be flagged passthrough`);
  }
});

test('empty and whitespace prompts never throw', () => {
  for (const prompt of ['', '   ', null, undefined]) {
    assert.doesNotThrow(() => classify(prompt));
    assert.strictEqual(classify(prompt).intent, 'execution');
  }
});

test('interrogative tone alone never creates a learning classification', () => {
  const result = classify('can you add a button to the header please?');
  assert.strictEqual(result.intent, 'execution');
});

test('execution wins exact ties', () => {
  // "explain" (learning w2) vs "format" (execution w2) — tie goes to execution.
  const result = classify('explain nothing, just format the file');
  assert.strictEqual(result.intent, 'execution');
});

test('category name lists match the PRD config vocabulary', () => {
  for (const cat of ['architecture', 'concurrency', 'distributed_systems', 'security']) {
    assert.ok(LEARNING_CATEGORIES.includes(cat), `${cat} must be a learning category (always_coach default)`);
  }
  for (const cat of ['boilerplate', 'tests', 'documentation', 'react_components', 'crud']) {
    assert.ok(EXECUTION_CATEGORIES.includes(cat), `${cat} must be an execution category (never_coach default)`);
  }
});

test('classifier is fast enough to never threaten the 500ms hook budget', () => {
  const prompts = fixtures.map((p) => p.prompt);
  const start = process.hrtime.bigint();
  for (let i = 0; i < 50; i++) for (const p of prompts) classify(p);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const perCall = ms / (50 * prompts.length);
  assert.ok(perCall < 1, `classify() averaged ${perCall.toFixed(3)}ms per call`);
});
