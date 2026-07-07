---
description: Set Hone's hint level (0 questions-only … 5 full implementation)
argument-hint: <0-5>
allowed-tools: Bash(node:*)
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" hint $ARGUMENTS`

Confirm the result above to the user in one short sentence. The scale, if they
ask: 0 questions only · 1 small nudges · 2 high-level ideas · 3 pseudocode ·
4 partial implementation · 5 full implementation (vanilla Claude Code).
