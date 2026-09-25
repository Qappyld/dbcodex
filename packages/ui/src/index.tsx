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
  diagnostics: Array<{ severity: string; message: string }>;
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
    return <section role="alert">
      <h1>Unable to display this DBML document</h1>
      <p>{result.diagnostics[0]?.message ?? "Unknown parser error."}</p>
    </section>;
  }

  const saved = result.layout.views["View All"]?.nodes ?? {};
  return (
    <DiagramApp
      graph={result.graph}
      saved={saved}
      save={async (tableId, position) => {
        await bridge.callTool("save_layout", {
          path: result.sourcePath,
          view: "View All",
          tableId,
          ...position,
        });
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
