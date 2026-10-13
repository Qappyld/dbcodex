import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { McpAppsBridge } from "./bridge.js";
import { Root } from "./Root.js";
import "./styles.css";

const bridge = new McpAppsBridge();
const container = document.getElementById("root");
if (!container) throw new Error("dbcodex root element is missing.");
createRoot(container).render(<StrictMode><Root bridge={bridge} /></StrictMode>);
