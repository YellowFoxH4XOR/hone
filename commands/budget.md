---
description: Set Hone's learning budget — % of eligible learning tasks that get coached
argument-hint: <0-100>
allowed-tools: Bash(node:*)
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" budget $ARGUMENTS`

Confirm the result above to the user in one short sentence. The budget is
enforced exactly and deterministically — e.g. at 20% the 5th, 10th, 15th…
eligible learning task gets coached, never randomly — and this takes effect
immediately without touching config.yaml.
