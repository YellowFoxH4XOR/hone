// Contract tests for the plugin's wiring: every path referenced by a manifest
// or command file must exist in the repo. This is what CI leans on to catch
// integration drift (e.g. hooks.json pointing at renamed hook scripts).

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Extract every ${CLAUDE_PLUGIN_ROOT}/<path> reference from a string.
function pluginRootRefs(text: string): string[] {
  return [...text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'`\s]+)/g)].map((m) => m[1]!);
}

test('plugin.json is valid and complete', () => {
  const manifest = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.strictEqual(manifest.name, 'hone');
  assert.ok(!manifest.name.includes(' '), 'name must be kebab-case');
  assert.strictEqual(manifest.license, 'MIT');
  assert.ok(manifest.version, 'version drives update semantics — keep it set and bump per release');
});

test('marketplace.json points at this repo as a single-plugin marketplace', () => {
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.ok(marketplace.name, 'marketplace name required');
  assert.ok(marketplace.owner?.name, 'owner.name required');
  assert.strictEqual(marketplace.plugins.length, 1);
  assert.strictEqual(marketplace.plugins[0].name, 'hone');
  assert.ok(String(marketplace.plugins[0].source).startsWith('./'), 'source must be a relative path');
});

test('every hook command in hooks.json references a file that exists', () => {
  const hooks = JSON.parse(read('hooks/hooks.json'));
  const events = Object.keys(hooks.hooks);
  for (const required of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
    assert.ok(events.includes(required), `hooks.json must register ${required}`);
  }
  for (const event of events) {
    for (const matcher of hooks.hooks[event]) {
      for (const hook of matcher.hooks) {
        assert.strictEqual(hook.type, 'command');
        const refs = pluginRootRefs(hook.command);
        assert.ok(refs.length > 0, `${event}: command must reference \${CLAUDE_PLUGIN_ROOT}`);
        for (const ref of refs) {
          assert.ok(fs.existsSync(path.join(ROOT, ref)), `${event}: missing file ${ref}`);
        }
      }
    }
  }
});

test('every command file has a description and references existing files', () => {
  const commandsDir = path.join(ROOT, 'commands');
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 5, 'on/off/skip/hint/status expected');
  for (const file of files) {
    const text = read(path.join('commands', file));
    assert.match(text, /^---\n[\s\S]*?\bdescription:/, `${file}: frontmatter description required`);
    for (const ref of pluginRootRefs(text)) {
      assert.ok(fs.existsSync(path.join(ROOT, ref)), `${file}: missing file ${ref}`);
    }
  }
});

test('user-facing surfaces exist: skill, statusline, README, LICENSE', () => {
  for (const rel of [
    'skills/socratic-review/SKILL.md',
    'statusline/statusline.ts',
    'README.md',
    'LICENSE',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
  }
});
