---
description: Set Hone's reflection mode (off, optional, or on) — the once-per-session recap after coached work
argument-hint: <off|optional|on>
allowed-tools: Bash(node:*)
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" reflection $ARGUMENTS`

Confirm the result above to the user in one short sentence. `on` asks for a
brief recap after every coached session; `optional` frames it as skippable;
`off` disables it entirely. This takes effect immediately without touching
config.yaml.
