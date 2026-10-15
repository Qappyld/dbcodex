import type { RefObject } from "react";
import { ViewManager, type ViewNavigation } from "./ViewManager.js";
import type { VisibilityPreview } from "./view-visibility.js";
import type { PresentationDocument, SchemaGraph } from "@dbcodex/core";

export interface ViewInspectorProps {
  graph: SchemaGraph; presentation: PresentationDocument; source: string; selectedIds: string[]; query: string;
  onVisibilityPreview?(value: VisibilityPreview | null): void;
  navigationRef?: RefObject<ViewNavigation | null>;
  onQueryChange(value: string): void; onSelectTable(id: string): void;
  onPresentationChange(value: PresentationDocument): void; onSourceChange(value: string): void; readOnly?: boolean;
}
export function ViewInspector(props: ViewInspectorProps) {
  return <div className="view-inspector"><ViewManager {...props} /></div>;
}
