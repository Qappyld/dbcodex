# DBCD workbench acceptance — 2026-09-27

Implementation reviewed at `2f42ebc` on `codex/dbcodex-workbench`.

## Automated checks

- `npm test`: 323 tests passed, 32 files.
- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm run verify:mcp`: passed (open 21.7 ms, save 12.1 ms).
- `npm run verify:offline-ui`: no remote UI dependencies.
- Installed bundle protocol check: passed (open 24.7 ms, save 15.5 ms).
- Final independent review: no remaining actionable defects.

## Interactive browser acceptance

Used the Codex in-app browser against a loopback-only test host forwarding actual MCP calls to the built server. The host used a temporary copy of `fixtures/demo-shop.dbcd`; the fixture was not edited. This is not a native MCP Apps host acceptance test.

Observed successfully:

- Source editor, graph and responsive inspector drawer.
- Create a named view; its DiagramView definition appears in DBML.
- Save creates a second revision; history diff shows the added view and source lines.
- Restore initial revision creates a third revision while retaining the earlier versions.
- Direct source edit, live validation, explicit save.
- Names-only, keys-only and all-fields display modes.
- Group creation with a reviewed TableGroup patch and colored group on canvas.
- Reload retains saved group and all-fields setting.
- Fit view and save viewport.
- Fullscreen request/response changes button state in the test host. Native host fullscreen remains unverified.

## Installation and remaining host check

`codex plugin add dbcodex@dbcodex-local --json` succeeded. `codex plugin list --marketplace dbcodex-local --json` confirms enabled version `0.1.0-dev.0+codex.20260927` from the implementation worktree.

The current chat's callable tool inventory does not expose the newly installed dbcodex tools. A refreshed host session must verify `open_dbcd` rendering and native fullscreen. No Windows association or custom native file editor is claimed.

The Computer Use skill prohibits automation of ChatGPT Desktop UI; the interactive test therefore used its supported browser surface. Diagram dragging, route handles and animated direction have automated coverage but were not exhaustively exercised by this browser smoke.
