// Shared heuristic: does this shell command modify files or repo state?
//
// Used by BOTH the Claude Code PreToolUse hook and the OpenCode plugin to
// decide whether a Bash/shell tool call should be blocked while the Solution
// Gate is pending. It is deliberately a speed bump, not a jail (see README
// "Known limitations") — a determined user can always route around it, and
// that's fine; the gate exists to make the default path go through thinking.

// Bash patterns that modify files or repo state.
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

export function isFileWritingBash(command: unknown): boolean {
  const cmd = String(command ?? '');
  return hasFileRedirect(cmd) || BASH_WRITE_PATTERNS.some((re) => re.test(cmd));
}
