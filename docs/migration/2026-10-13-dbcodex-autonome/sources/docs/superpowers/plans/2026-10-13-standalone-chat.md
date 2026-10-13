# DBCodex standalone chat implementation plan

**Goal:** deliver the first local Windows desktop workbench with multiple discussions, explicit reviewed proposals, persistence and Codex/Claude adapters.
**Architecture:** existing core stores and UI; isolated Electron shell; companion chat SQLite; no model-authorized writes; apply exact proposals only through a user click.
**Constraints:** preserve old uncommitted native integration, no commits/merges/main edits, no format migration, no hidden remote schema transmission. Use tests before behavior.

- [x] Audit implementation checkout and baseline (334 tests).
- [ ] Shared contracts and desktop build/package configuration (root).
- [ ] Chat storage, context filtering, proposal validation/application and crash reconciliation (storage implementer; isolated files).
- [ ] Codex/Claude process adapters with tools disabled and cancellation (provider implementer; isolated files).
- [ ] Renderer with workbench reuse, threads, context choice, proposal diff/application (UI implementer; minimal callback additions only).
- [ ] Electron preload/IPC, native files, trusted project service and smoke tests (root).
- [ ] Integrate, review, run complete gates, build portable executable and document limits.

Storage owns `packages/desktop/src/chat-store.ts`, `chat-service.ts`, their tests. Providers own `packages/desktop/src/providers/**` and tests. Renderer owns `packages/desktop/src/renderer/**`, its tests and optional workbench callbacks. Root owns package manifests/lockfile, shared contracts, Electron main/preload/service, build and package scripts. Other contributors do not edit shared manifests.
