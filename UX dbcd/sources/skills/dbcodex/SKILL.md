---
name: dbcodex
description: Create, inspect and edit local .dbcd schema projects through MCP, import/export DBML, and open the diagram workbench in Codex.
---

# dbcodex

Native integration experiment (2026-10-09): use `open_dbcd_workbench` for the thread entrypoint and `open_dbcd_app` for the global entrypoint. Both accept `{}` and display a local project-path launcher. Host UI availability, persistence across chats and automatic restart restoration must be observed; metadata alone is not proof. File entrypoints for `.dbcd`/`.dbml` resolve via `resolve_dbcd_file` using host-owned metadata, never by guessing the resource URI as a path.

For user-requested project creation, call `create_dbcd` with a fixed `profile` and optional `sourceText` and complete business `model`. It validates before creating and never overwrites an existing destination. Supported profiles: generic, SharePoint, SQL with dialect, Dataverse with publisherPrefix. Do not create SQLite internals yourself.

For user-requested inspection or editing that needs source access, call `read_dbcd`. This explicitly shares saved DBML and business metadata with the assistant; opening the UI alone does not. Draft contents are omitted unless `includeDraft:true` is needed for the request. Read `projectId`, `currentRevisionId`, `generation`; use them as `expectedProjectId`, `expectedRevisionId`, `expectedGeneration` for `validate_dbcd_changes`, then `update_dbcd`. These plain MCP tools work without an Apps renderer. At least one of `sourceText` or `model` is required: each supplied field replaces the complete value, so preserve all unrelated content and metadata. Omitted fields are preserved, with lookup targets reconciled after source-only edits. Views and positions are preserved. Table/column deletion or renaming may require updating model keys too. Validate first; warnings are allowed, errors block saving. A requested valid edit needs no additional confirmation. Each accepted update creates one revision.

For exact text replacements, `apply_dbcd_edits` remains available. Obtain source and fresh `generation`, `currentRevisionId`, `sourceHash` from `read_dbcd`, mapping these to its expected fields. It requires unique matches and preserves presentation. All assistant edits refuse recoverable drafts and stale state; do not discard drafts or merely refresh expected values to force an old proposal. Re-read and reassess on conflict. Visible workbenches refresh saved changes through local MCP reads; dirty editors show a conflict. No automatic Git commit. See [shared Codex / Claude guide](../../docs/assistant-mcp.md).

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

Keep file processing local. `read_dbcd` is an explicit disclosure to the requesting assistant and its provider; use it only when the user's request needs schema access. Do not send source, graphs, presentations, drafts or revisions to additional network services. Preserve the no-speculative-write rule for schema, view and history changes. Opening or explaining a project is not permission to edit, import, export or restore it.
