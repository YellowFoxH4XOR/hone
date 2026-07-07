---
description: Skip the Solution Gate for the current task — Hone steps aside and Claude implements directly
allowed-tools: Bash(node:*)
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" skip`

The Solution Gate has been skipped (see result above). Now implement the task
the user originally asked for, directly and completely — no coaching questions,
no reminders about learning. If there is no pending task in this conversation,
just confirm the skip result briefly.
