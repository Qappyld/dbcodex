# Native dbcodex integration implementation plan

**Goal:** reuse the existing workbench in documented native thread/global/file surfaces, synchronize saved external edits, and protect drafts during teardown.

**Authorization:** the user's mission authorizes autonomous selection and implementation. No commits, merges, changes to main, remote schema service or editor redesign.

**Design:** reuse one UI resource. Empty-input thread/global tools return a launcher; file input uses SDK host-owned path metadata, rechecked against workspace roots. A public exact-text edit tool updates a saved project with optimistic concurrency and refuses stored drafts. The existing session refreshes through local MCP reads every two seconds and detects conflicts. Orderly teardown flushes recoverable work. The host owns tab persistence; do not promise a single instance shared across threads or automatic restart restoration.

**Approaches considered:** thread entrypoint (preferred beside conversation); global entrypoint (permanent app tab where supported); existing tool-invoked viewer (fallback). No external-browser alternative.

## Execution

- [x] Record clean implementation checkout, install locked dependencies, run all six baseline checks (323 tests).
- [x] Add failing tests for entrypoint metadata, launcher, file confinement and exact edits; implement using `@openai/mcp-extensions` and existing stores.
- [x] Add failing UI tests for launcher, external refresh/conflicts, stale responses and teardown; extend the existing bridge/session without replacing editors.
- [x] Extend real stdio protocol verification and rerun automated checks. Keep native UI results separate (334 tests; full gate and installed bundle pass).
- [x] Refresh local plugin, provide safe native test copy and manual acceptance steps. Record actual host evidence and unsupported/unverified persistence separately.
- [ ] Observe native visual acceptance in a new host session attached to the implementation checkout; human interaction required, steps in the evidence report.

## Files

MCP: `create-server.ts`, new `native-integration.ts`, `handlers.ts`, tests. Core: optional internal draft guard in existing save transaction. UI: `Root.tsx`, new launcher, `bridge.ts`, `useDocumentSession.ts`, tests. Packaging: SDK dependency and version alignment. Evidence: `docs/evidence/native-integration.md`; README/skill usage additions.

## Acceptance

All existing tests retained; exact edits preserve unrelated text and presentation; optimistic identity checks and draft checks occur inside the write transaction; no file URI guessed as a path; no full source in model-visible edit results; refresh never overwrites local dirty work; teardown creates a draft, not a revision. Native render, fullscreen, conversation change and restart require observed host results, not a simulated PASS.
