export type ActionIconName = "chevronDown" | "chevronRight" | "minimap" | "route" | "new" | "open" | "save" | "copy" | "undo" | "redo" | "layout" | "history" | "views" | "fullscreen" | "theme" | "import" | "export" | "relations" | "grid" | "motion" | "group" | "color" | "note";
const paths: Record<ActionIconName, string> = {
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  minimap: "M3 3h18v18H3V3Zm3 3h6v5H6V6Zm8 7h4v5h-4v-5",
  route: "M3 5h6v14h12m-4-4 4 4-4 4M3 2v6",
  relations: "M3 6h6v12h12m-4-4 4 4-4 4M3 3v6",
  grid: "M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18",
  motion: "m9 5 11 7-11 7V5ZM3 5v14",
  group: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7",
  color: "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a3 3 0 0 0 3-3c0-4-4-7-9-7ZM7 8h.01M12 6h.01M17 8h.01M6 13h.01",
  note: "M4 3h16v12l-6 6H4V3Zm10 18v-6h6M8 7h8M8 11h6",
  new: "M12 5v14M5 12h14", open: "M3 7h6l2 2h10l-3 11H3V7Zm0 0V4h6l2 3",
  save: "M4 3h13l4 4v14H3V3h1Zm3 0v6h9V3M7 21v-8h10v8",
  copy: "M9 9h12v12H9V9ZM15 5V3H3v12h2", undo: "M8 4 3 9l5 5M3 9h11a7 7 0 0 1 7 7v4",
  redo: "m16 4 5 5-5 5M21 9H10a7 7 0 0 0-7 7v4", layout: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7",
  history: "M3 4v6h6M3 10a9 9 0 1 1 1 8M12 7v5l3 2", views: "M3 4h18v16H3V4Zm12 0v16",
  fullscreen: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5", theme: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  import: "M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5", export: "M12 15V3m-5 5 5-5 5 5M3 16v5h18v-5",
};
export function ActionIcon({ name }: { name: ActionIconName }) {
  return <svg className="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
