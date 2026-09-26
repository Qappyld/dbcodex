---
name: dbcodex
description: Open and edit local .dbcd schema projects, import/export DBML, and explore local diagrams directly in Codex.
---

# dbcodex

Use this skill for local `.dbcd` projects and `.dbml` exchange files in the active workspace.

1. Use the supplied workspace-relative path. Ask for a path only when it is missing.
2. Open an editable `.dbcd` project with `open_dbcd`. Let the MCP Apps component render its DBML editor, diagram and inspector. Report diagnostics without quoting the full source.
3. Import only when requested, with `import_dbml(sourcePath, projectPath)`. Import creates a new `.dbcd` file and refuses to overwrite an existing destination. If the named destination already exists, explain the conflict and obtain a new path; never delete the existing project to make import succeed.
4. Export only when requested, with `export_dbml(projectPath, targetPath)`. Export preserves the saved DBML text exactly; it excludes unsaved drafts and refuses to overwrite an existing destination. A revision ID can select a historical export.
5. For legacy `.dbml` exploration, call `open_dbml`. Call `save_layout` only after an explicit table movement by the user or the interactive component. Never make speculative layout changes.

Example user flows:

```text
Ouvre fixtures/demo-shop.dbcd avec dbcodex.
Importe fixtures/demo-shop.dbml dans fixtures/demo-shop.dbcd.
Exporte la version courante de fixtures/demo-shop.dbcd vers fixtures/demo-shop-export.dbml.
```

The tracked demo project already exists, so these are independent examples; importing needs a fresh destination.

`.dbcd` is the editable project file. `.dbml` is the exchange format. Every accepted explicit save is versioned. Drafts are recoverable work, not revisions. The UI owns validation, draft persistence, save, history, pin and restore through app-only tools (`validate_dbcd_draft`, `save_dbcd_draft`, `discard_dbcd_draft`, `save_dbcd`, `list_dbcd_revisions`, `read_dbcd_revision`, `pin_dbcd_revision`, `restore_dbcd_revision`). Do not invoke app-only mutations speculatively or to simulate a user action. No automatic Git commits.

History reads one selected snapshot lazily; full DBML and presentation are private in `_meta.dbcodex.revision`. The comparison runs from that revision to current work, including unsaved edits. Restore is a deliberate action inside History, creates a new current revision, and replaces the current draft; explain this if the user is unsure. Pinning preserves a revision from automatic retention.

The app can request fullscreen and return to inline mode while retaining its session. A host may decline fullscreen. Custom OS/editor association and a Codex side-panel file association are not guaranteed; do not claim them from successful inline/fullscreen MCP Apps rendering alone.

Keep all schema content local. Never send source, parsed graph, presentation, drafts or revision snapshots to a network service. Preserve the no-speculative-write rule for all schema, view and history changes. Opening or explaining a project is not permission to edit, import, export or restore it.
