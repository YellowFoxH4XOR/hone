---
description: Report that Hone misclassified the last prompt — records it locally and unblocks any wrongly-opened gate
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" wrong $ARGUMENTS`

Relay the output above briefly. If a gate was unblocked, proceed with the
user's original request directly — Hone got this one wrong, so implement
normally with no coaching framing.
