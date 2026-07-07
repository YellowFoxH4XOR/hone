#!/usr/bin/env node
// PreToolUse — enforcement layer for the Solution Gate (F2).
//
// While a session's gate is `pending` (coached task, user hasn't shared an
// approach yet), deny file-modifying tools. permissionDecision: "deny" holds
// even in bypassPermissions mode, which is exactly what a gate needs.
// Everything read-only stays allowed so Claude can still look at the code
// while it asks its questions.

import { emit, run } from '../lib/hook-io.ts';
import * as state from '../lib/state.ts';
import * as configLib from '../lib/config.ts';
import * as gate from '../lib/gate.ts';
import * as coaching from '../lib/coaching.ts';

const FILE_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Bash patterns that modify files or repo state. Not exhaustive — the gate is
// a speed bump, not a jail (see README "Known limitations").
const BASH_WRITE_PATTERNS: RegExp[] = [
  /<<-?\s*['"]?\w+/, // heredocs
  /\btee\b/,
  /\bsed\b[^|]*-i/,
  /\b(mv|cp|rm|touch|mkdir|rmdir|truncate|dd|ln)\b/,
  /\b(npm|pnpm|yarn)\s+(i|install|add|remove|uninstall)\b/,
  /\bpip3?\s+install\b/,
  /\bcargo\s+(add|install)\b/,
  /\bgit\s+(commit|apply|checkout|restore|stash|merge|rebase|cherry-pick|reset|clean)\b/,
  /\b(chmod|chown)\b/,
];

// A '>' means a file write ONLY after discounting the harmless forms that
// read-only commands use constantly: stderr merges (2>&1), null sinks
// (>/dev/null), and arrow tokens inside inline scripts or grep patterns.
function hasFileRedirect(command: string): boolean {
  const cleaned = command
    .replace(/\d?>&\d/g, '')
    .replace(/[\d&]?>+\s*\/dev\/null/g, '')
    .replace(/=>/g, '')
    .replace(/->/g, '');
  return />/.test(cleaned);
}

function deny(reason: string): void {
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

run(async (input) => {
  const runtime = state.loadRuntimeState();
  const config = configLib.effective(configLib.loadConfig({ cwd: input.cwd }), runtime);
  if (!config.hone.enabled) return;

  const session = state.loadSession(input.session_id);
  if (!gate.isBlocking(session)) return;

  const tool = String(input.tool_name ?? '');

  if (FILE_WRITING_TOOLS.has(tool)) {
    deny(coaching.gateDenyReason(session));
    return;
  }

  if (tool === 'Bash') {
    const command = String(input.tool_input?.command ?? '');
    // The /hone:skip escape hatch must always work while the gate is closed.
    if (command.includes('hone-ctl')) return;
    if (hasFileRedirect(command) || BASH_WRITE_PATTERNS.some((re) => re.test(command))) {
      deny(coaching.gateDenyReason(session));
    }
  }
});
