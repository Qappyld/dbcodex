---
name: dbcodex
description: Open, validate, and interact with local DBML files directly in Codex.
---

# dbcodex

Use this skill when the user wants to inspect or visualize a `.dbml` file in the active workspace.

1. Ask for a workspace-relative `.dbml` path only when the user has not supplied one.
2. Call `open_dbml` with that path and present any parser diagnostics without quoting the full source.
3. Let the interactive component render the returned graph when the host supports MCP Apps.
4. Call `save_layout` only after an explicit table movement by the user or the interactive component. Never make speculative layout changes.

Keep DBML content local. Never send the source, parsed graph, or layout to a network service.
