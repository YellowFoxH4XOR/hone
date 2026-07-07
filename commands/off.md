---
description: Disable Hone coaching (re-enable with /hone:on)
allowed-tools: Bash(node:*)
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" off`

Confirm to the user in one short sentence that Hone is disabled and that
/hone:on brings it back.
