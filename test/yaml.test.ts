import { test } from 'node:test';
import assert from 'node:assert';
import * as yaml from '../lib/yaml.ts';
import { DEFAULT_CONFIG_YAML } from '../lib/config.ts';
import type { YamlMap } from '../lib/types.ts';

// Tests reach into parsed structures freely — cast once per parse.
function parseMap(text: string): Record<string, any> {
  return yaml.parse(text) as YamlMap as Record<string, any>;
}

test('parses the exact PRD config shape', () => {
  const parsed = parseMap(`
hone:
  enabled: true
  learning_budget: 20
  hint_level: 1
  review_only: true
  reflection: optional
  categories:
    always_coach:  [architecture, concurrency, distributed_systems, security]
    never_coach:   [boilerplate, tests, documentation, react_components, crud]
  dashboard:
    statusline: true
    local_server: true
    port: 4173
  telemetry:
    otel_export: false
`);
  assert.strictEqual(parsed.hone.enabled, true);
  assert.strictEqual(parsed.hone.learning_budget, 20);
  assert.strictEqual(parsed.hone.reflection, 'optional');
  assert.deepStrictEqual(parsed.hone.categories.always_coach, [
    'architecture', 'concurrency', 'distributed_systems', 'security',
  ]);
  assert.strictEqual(parsed.hone.dashboard.port, 4173);
  assert.strictEqual(parsed.hone.telemetry.otel_export, false);
});

test('parses the shipped default config template', () => {
  const parsed = parseMap(DEFAULT_CONFIG_YAML);
  assert.strictEqual(parsed.hone.enabled, true);
  assert.strictEqual(parsed.hone.learning_budget, 100);
  assert.strictEqual(parsed.hone.reflection, 'on');
  assert.ok(Array.isArray(parsed.hone.categories.never_coach));
});

test('comments, blank lines, and inline comments are ignored', () => {
  const parsed = parseMap(`
# top comment
a: 1  # inline comment

b: "text # not a comment"
`);
  assert.deepStrictEqual(parsed, { a: 1, b: 'text # not a comment' });
});

test('regression: block-list dashes at the SAME indent as the parent key (idiomatic YAML)', () => {
  const parsed = parseMap(`
categories:
  always_coach:
  - architecture
  - security
  never_coach: []
`);
  assert.deepStrictEqual(parsed.categories.always_coach, ['architecture', 'security']);
  assert.deepStrictEqual(parsed.categories.never_coach, []);
});

test('regression: escaped quotes do not leak inline comments into the value', () => {
  const parsed = parseMap('name: "abc \\" def" # comment');
  assert.strictEqual(parsed.name, 'abc " def');
});

test('block lists of scalars', () => {
  const parsed = parseMap(`
items:
  - one
  - 2
  - true
`);
  assert.deepStrictEqual(parsed.items, ['one', 2, true]);
});

test('scalar typing: bool, int, float, null, quoted strings', () => {
  const parsed = parseMap(`
t: true
f: False
n1: null
n2: ~
i: -42
fl: 3.14
s1: 'single'
s2: "double \\"quoted\\""
plain: hello world
`);
  assert.strictEqual(parsed.t, true);
  assert.strictEqual(parsed.f, false);
  assert.strictEqual(parsed.n1, null);
  assert.strictEqual(parsed.n2, null);
  assert.strictEqual(parsed.i, -42);
  assert.strictEqual(parsed.fl, 3.14);
  assert.strictEqual(parsed.s1, 'single');
  assert.strictEqual(parsed.s2, 'double "quoted"');
  assert.strictEqual(parsed.plain, 'hello world');
});

test('empty input and empty inline lists', () => {
  assert.deepStrictEqual(yaml.parse(''), {});
  assert.deepStrictEqual(yaml.parse('# only comments\n'), {});
  assert.deepStrictEqual(parseMap('x: []').x, []);
});

test('malformed yaml throws (config loader catches it)', () => {
  assert.throws(() => yaml.parse('just a bare scalar line with: no consistent : structure\n  bad indent: 1\n'));
});

test('values containing colons survive (urls)', () => {
  const parsed = parseMap('url: https://example.com/path');
  assert.strictEqual(parsed.url, 'https://example.com/path');
});
