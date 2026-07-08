# Hone on OpenCode

Hone runs on [OpenCode](https://opencode.ai) as well as Claude Code. Same
behavioral layer — intent routing, Learning Budget, Solution Gate, hint levels,
Socratic reviews, auto-feedback, deferred reflection, and the adaptive skill
profile — wired to OpenCode's plugin API instead of Claude Code's hooks. The
entire `lib/` core is shared; only the thin adapter in `opencode/plugin/hone.ts`
is platform-specific.

## How the port maps

| Hone mechanism | Claude Code | OpenCode |
|---|---|---|
| Intent route + inject coaching | `UserPromptSubmit` → `additionalContext` | `chat.message` → `output.parts.push({ type: "text", … })` |
| Solution Gate: block edits | `PreToolUse` `deny` | `tool.execute.before` → `throw` |
| Auto-feedback on your code | `PostToolUse` | `tool.execute.after` → appends to the tool result |
| Session start + deferred reflection | `SessionStart` | first `chat.message` of a session |
| Reflection queueing | `Stop` | `event` `session.idle` |
| `/hone:*` controls | plugin commands | `.opencode/commands/hone-*.md` (same `hone-ctl`) |

## Install

Hone's OpenCode plugin imports the shared `lib/` next to it, so the plugin file
must run from inside a checkout of this repo. The cleanest way is a **re-export
shim** in your OpenCode plugins directory that points at the checkout (Node
resolves the real path, so the plugin's relative `../../lib` imports work):

```sh
# 1. Get Hone somewhere stable
git clone https://github.com/YellowFoxH4XOR/hone ~/tools/hone

# 2. Make hone-ctl runnable (for the /hone-* commands)
cd ~/tools/hone && npm link          # exposes `hone-ctl` on your PATH
#   (or: npm install -g ~/tools/hone)

# 3. Register the plugin via a one-line shim
mkdir -p ~/.config/opencode/plugins
cat > ~/.config/opencode/plugins/hone.ts <<'EOF'
export { HonePlugin as default } from "/absolute/path/to/hone/opencode/plugin/hone.ts"
EOF

# 4. Install the control commands
mkdir -p ~/.config/opencode/commands
cp ~/tools/hone/opencode/commands/*.md ~/.config/opencode/commands/
```

Requirements: Node ≥ 22.18 (for `hone-ctl`'s native TS type-stripping) — OpenCode
itself runs the plugin under Bun, which handles TypeScript directly.

## Commands

`/hone-status`, `/hone-on`, `/hone-off`, `/hone-skip`, `/hone-hint <0-5>`,
`/hone-budget <0-100>`, `/hone-reflection <off|optional|on>`, `/hone-wrong`,
`/hone-interview [topic|stop]`. (OpenCode commands are `/hone-x`; the Claude Code
equivalents are `/hone:x`.)

## Config & state

Configuration and state live in the same place on both platforms:
`~/.claude/hone/` (`config.yaml`, `profile.json`, `sessions/`). Set
`HONE_STATE_DIR` to relocate it. Using Hone on both Claude Code and OpenCode
therefore shares **one** skill profile — your progress follows you across tools.

Per-repo overrides via `.hone.yaml` work the same way.

## Known differences from the Claude Code build

- **Injection point.** Coaching context is added to the user message's `parts`
  (OpenCode's supported injection surface) rather than a dedicated
  `additionalContext` field. Behavior is the same; the mechanism differs.
- **Auto-feedback** is appended to the write tool's result text (OpenCode's
  in-turn model-facing surface), not a separate hook output.
- **No statusline.** OpenCode doesn't expose a plugin statusline the way Claude
  Code does; `/hone-status` gives the same information on demand.
- **Gate is a speed bump, not a jail** — same as on Claude Code. A determined
  shell one-liner can route around `tool.execute.before`; that's by design.
