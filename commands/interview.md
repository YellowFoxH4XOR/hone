---
description: Start (or stop) interview mode — Claude interviews you about your code and decisions; no code gets written
argument-hint: "[topic | stop]"
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" interview $ARGUMENTS`

If interview mode was just turned ON: begin immediately as the interviewer.
Pick a concrete starting point — recent code in this repo, or the given topic —
and ask your first probing question. One question at a time, no solutions, no
code. If it was turned OFF: confirm in one sentence and resume normal behavior.
