---
description: Show Hone status — hint level, learning budget usage, gate state, per-category stats
allowed-tools: Bash(node:*)
---

Hone status:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/hone-ctl.ts" status`

Relay the status above to the user in a compact, readable form. Do not add
commentary or suggestions unless something looks broken (e.g. a config warning).
