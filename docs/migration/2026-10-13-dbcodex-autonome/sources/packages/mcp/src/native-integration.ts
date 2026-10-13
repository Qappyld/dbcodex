import { createHash } from "node:crypto";
import { extname, isAbsolute, relative, sep } from "node:path";
import { getResourcePath } from "@openai/mcp-extensions/server";
import { openDbcdProject, saveDbcdProject, DbcdProjectStoreError } from "@dbcodex/core";
import type { createHandlers } from "./handlers.js";

export interface ExactEdits {
  path: string; expectedGeneration: number; expectedRevisionId: string; expectedSourceHash: string;
  edits: Array<{ search: string; replacement: string }>;
}
const failure = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });

export function createNativeIntegration(roots: () => Promise<readonly string[]>, handlers: ReturnType<typeof createHandlers>) {
  return {
    launch: async () => ({
      content: [{ type: "text" as const, text: "Open a workspace-relative project in the DBCodex workbench." }],
      structuredContent: { dbcodexLauncher: true,
        workspaceKey: createHash("sha256").update(JSON.stringify(await roots())).digest("hex") },
    }),
    openFile: async (_input: { file: { name: string; resourceUri: string } }, meta: unknown) => {
      try {
        // Resource URIs are opaque. Only host-owned metadata supplies a path.
        const path = getResourcePath(meta);
        if (!path || !isAbsolute(path)) return failure("The host did not supply a workspace file path. Open the project by relative path instead.");
        for (const root of await roots()) {
          const within = relative(root, path);
          if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) continue;
          const input = { path: within.split(sep).join("/") };
          if (extname(within).toLowerCase() === ".dbcd") return handlers.openDbcd(input);
          if (extname(within).toLowerCase() === ".dbml") return handlers.openDbml(input);
        }
        return failure("The file is not an allowed workspace project.");
      } catch { return failure("Unable to open the workspace file."); }
    },
    edit: async (input: ExactEdits) => {
      try {
        for (const root of await roots()) {
          let snapshot;
          try { snapshot = await openDbcdProject({ workspaceRoot: root, projectPath: input.path }); }
          catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "NOT_FOUND") continue;
            throw error;
          }
          if (snapshot.readOnly || snapshot.draft || snapshot.generation !== input.expectedGeneration
            || snapshot.currentRevisionId !== input.expectedRevisionId || snapshot.sourceHash !== input.expectedSourceHash) return failure("The project changed or has a recoverable draft. Save or resolve the editor work and reopen before editing.");
          let sourceText = snapshot.sourceText;
          if (!input.edits.length || input.edits.length > 100) return failure("Supply between one and 100 exact edits.");
          for (const { search, replacement } of input.edits) {
            const index = sourceText.indexOf(search);
            if (!search || index < 0 || sourceText.indexOf(search, index + 1) !== -1) return failure("Each search must match exactly once; no changes were saved.");
            sourceText = sourceText.slice(0, index) + replacement + sourceText.slice(index + search.length);
          }
          await saveDbcdProject({ workspaceRoot: root, projectPath: input.path, sourceText,
            presentation: snapshot.presentation, expectedGeneration: snapshot.generation,
            expectedProjectId: snapshot.projectId, expectedRevisionId: snapshot.currentRevisionId,
            rejectDraft: true, label: "Codex exact edits" });
          return handlers.openDbcd({ path: input.path });
        }
        return failure("The project does not exist in an allowed workspace.");
      } catch (error) {
        return failure(error instanceof DbcdProjectStoreError ? error.message : "Unable to apply project edits without exposing file contents.");
      }
    },
  };
}
