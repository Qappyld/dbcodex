import { useEffect, useState } from "react";
import type { Diagnostic, LayoutDocument, SchemaGraph } from "@dbcodex/core";
import { DiagramApp } from "./DiagramApp.js";
import { ProjectWorkbench } from "./DbcdWorkbench.js";
import { ProjectLauncher } from "./ProjectLauncher.js";
import { readDbcdProjectResult, type WorkbenchBridge } from "./bridge.js";

interface OpenResult {
  sourcePath: string;
  graph: SchemaGraph | null;
  layout: LayoutDocument;
  diagnostics: Diagnostic[];
  layoutWarnings: string[];
}

function readLegacyResult(value: unknown): OpenResult | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as { structuredContent?: unknown; isError?: boolean };
  if (envelope.isError || !envelope.structuredContent || typeof envelope.structuredContent !== "object") return null;
  const result = envelope.structuredContent as Partial<OpenResult>;
  return typeof result.sourcePath === "string" && result.layout?.views && Array.isArray(result.diagnostics)
    && (result.graph === null || Array.isArray(result.graph?.tables)) ? result as OpenResult : null;
}

export interface RootBridge extends WorkbenchBridge {
  start(): Promise<void>;
  subscribeToToolResults(listener: (result: unknown) => void): () => void;
}

export function Root({ bridge }: { bridge: RootBridge }) {
  const [result, setResult] = useState<unknown>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [launcherKey, setLauncherKey] = useState<string | null>(null);
  useEffect(() => {
    let active = true, sequence = 0;
    const unsubscribe = bridge.subscribeToToolResults((value) => {
      // Tool acknowledgements must not replace an open document/session.
      if (readDbcdProjectResult(value) || readLegacyResult(value)) { sequence += 1; setResult(value); }
      const launcher = (value as { structuredContent?: { dbcodexLauncher?: boolean; workspaceKey?: string } })?.structuredContent;
      if (launcher?.dbcodexLauncher && typeof launcher.workspaceKey === "string") setLauncherKey(launcher.workspaceKey);
      const file = (value as { structuredContent?: { dbcodexFile?: unknown } })?.structuredContent?.dbcodexFile;
      if (file) {
        const request = ++sequence;
        void bridge.callTool("resolve_dbcd_file", {}).then((resolved) => {
          if (!active || sequence !== request) return;
          if (!readDbcdProjectResult(resolved) && !readLegacyResult(resolved)) throw new Error("Unable to open the workspace file.");
          setResult(resolved);
        }).catch(() => { if (active && sequence === request) setConnectionError(true); });
      }
    });
    void bridge.start().catch(() => { if (active) setConnectionError(true); });
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  const project = readDbcdProjectResult(result);
  if (project) return <ProjectWorkbench key={project.projectPath} result={result} bridge={bridge} />;
  const legacy = readLegacyResult(result);
  if (!legacy && launcherKey) return <ProjectLauncher bridge={bridge} workspaceKey={launcherKey} opened={setResult} />;
  if (!legacy) return <p role="status">{connectionError ? "Unable to connect to the document host." : "Waiting for a DBML document…"}</p>;
  if (!legacy.graph) {
    const diagnostic = legacy.diagnostics[0];
    const detail = diagnostic ? [diagnostic.message,
      diagnostic.code === undefined ? null : `Code ${diagnostic.code}.`,
      diagnostic.location ? `Line ${diagnostic.location.start.line}, column ${diagnostic.location.start.column}.` : null,
    ].filter(Boolean).join(" ") : "Unknown parser error.";
    return <section role="alert"><h1>Unable to display this DBML document</h1><p>{detail}</p></section>;
  }
  return <DiagramApp graph={legacy.graph} saved={legacy.layout.views["View All"]?.nodes ?? {}}
    warnings={legacy.layoutWarnings} save={async (tableId, position) => {
      const response = await bridge.callTool("save_layout", { path: legacy.sourcePath, view: "View All", tableId, ...position });
      if (response && typeof response === "object" && "isError" in response && response.isError === true) {
        throw new Error("The layout could not be saved.");
      }
    }} />;
}
