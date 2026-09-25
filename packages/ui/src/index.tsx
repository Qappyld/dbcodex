import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LayoutDocument, SchemaGraph } from "@dbcodex/core";
import { DiagramApp } from "./DiagramApp.js";
import { McpAppsBridge } from "./bridge.js";
import "./styles.css";

interface OpenResult {
  sourcePath: string;
  graph: SchemaGraph | null;
  layout: LayoutDocument;
  diagnostics: Array<{
    severity: string;
    message: string;
    code?: string | number;
    location?: { start: { line: number; column: number } };
  }>;
  layoutWarnings: string[];
}

function readStructuredContent(value: unknown): OpenResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const envelope = value as { structuredContent?: unknown };
  if (!envelope.structuredContent || typeof envelope.structuredContent !== "object") {
    return null;
  }
  return envelope.structuredContent as OpenResult;
}

const bridge = new McpAppsBridge();

function Root() {
  const [result, setResult] = useState<OpenResult | null>(null);

  useEffect(() => {
    const unsubscribe = bridge.subscribeToToolResults((value) => {
      setResult(readStructuredContent(value));
    });
    void bridge.start();
    return unsubscribe;
  }, []);

  if (!result) {
    return <p role="status">Waiting for a DBML document…</p>;
  }
  if (!result.graph) {
    const diagnostic = result.diagnostics[0];
    const detail = diagnostic
      ? [
          diagnostic.message,
          diagnostic.code === undefined ? null : `Code ${diagnostic.code}.`,
          diagnostic.location
            ? `Line ${diagnostic.location.start.line}, column ${diagnostic.location.start.column}.`
            : null,
        ].filter(Boolean).join(" ")
      : "Unknown parser error.";
    return <section role="alert">
      <h1>Unable to display this DBML document</h1>
      <p>{detail}</p>
    </section>;
  }

  const saved = result.layout.views["View All"]?.nodes ?? {};
  return (
    <DiagramApp
      graph={result.graph}
      saved={saved}
      warnings={result.layoutWarnings}
      save={async (tableId, position) => {
        const response = await bridge.callTool("save_layout", {
          path: result.sourcePath,
          view: "View All",
          tableId,
          ...position,
        });
        if (
          response &&
          typeof response === "object" &&
          "isError" in response &&
          response.isError === true
        ) {
          throw new Error("The layout could not be saved.");
        }
      }}
    />
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("dbcodex root element is missing.");
}
createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
