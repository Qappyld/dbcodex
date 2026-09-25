import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const viewSchema = z.object({
  nodes: z.record(z.string(), positionSchema),
});

const layoutSchema = z.object({
  version: z.literal(1),
  source: z.string().min(1),
  views: z.record(z.string(), viewSchema),
});

export type Position = z.infer<typeof positionSchema>;
export type LayoutDocument = z.infer<typeof layoutSchema>;

export interface LayoutLoadResult {
  document: LayoutDocument;
  warnings: string[];
  writable: boolean;
}

export type LayoutStoreCode =
  | "INVALID_LAYOUT"
  | "INVALID_POSITION"
  | "UNKNOWN_SOURCE"
  | "OUTSIDE_WORKSPACE";

export class LayoutStoreError extends Error {
  constructor(
    public readonly code: LayoutStoreCode,
    message: string,
  ) {
    super(message);
    this.name = "LayoutStoreError";
  }
}

function cleanSource(source: string): string {
  const normalized = source.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !normalized.toLowerCase().endsWith(".dbml") ||
    isAbsolute(source) ||
    segments.includes("..") ||
    segments.some((segment) => segment.length === 0)
  ) {
    throw new LayoutStoreError(
      "UNKNOWN_SOURCE",
      "Layout source must be a workspace-relative DBML path.",
    );
  }
  return normalized;
}

function sidecarPath(workspaceRoot: string, source: string): string {
  return (
    join(workspaceRoot, ".dbcodex", "layouts", ...cleanSource(source).split("/")) +
    ".layout.json"
  );
}

function escapes(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  );
}

async function safeSidecarPath(
  workspaceRoot: string,
  source: string,
): Promise<string> {
  const root = await realpath(workspaceRoot);
  const target = sidecarPath(root, source);
  if (escapes(root, target)) {
    throw new LayoutStoreError(
      "OUTSIDE_WORKSPACE",
      "The layout sidecar must stay in the workspace.",
    );
  }

  const segments = relative(root, target).split(sep);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new LayoutStoreError(
          "OUTSIDE_WORKSPACE",
          "Layout paths cannot contain symbolic links or junctions.",
        );
      }
      if (index < segments.length - 1 && !stats.isDirectory()) {
        throw new LayoutStoreError(
          "INVALID_LAYOUT",
          "A layout path component is not a directory.",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        break;
      }
      throw error;
    }
  }

  return target;
}

const saveQueues = new Map<string, Promise<void>>();

async function withSaveLock<T>(target: string, action: () => Promise<T>): Promise<T> {
  const previous = saveQueues.get(target) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  saveQueues.set(target, current);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (saveQueues.get(target) === current) {
      saveQueues.delete(target);
    }
  }
}

function emptyLayout(source: string): LayoutDocument {
  return { version: 1, source, views: {} };
}

export async function loadLayout(
  workspaceRoot: string,
  source: string,
): Promise<LayoutLoadResult> {
  const clean = cleanSource(source);
  const target = await safeSidecarPath(workspaceRoot, clean);
  try {
    const parsed: unknown = JSON.parse(
      await readFile(target, "utf8"),
    );
    const result = layoutSchema.safeParse(parsed);
    if (!result.success || result.data.source !== clean) {
      return {
        document: emptyLayout(clean),
        warnings: ["Layout sidecar is invalid."],
        writable: false,
      };
    }
    return { document: result.data, warnings: [], writable: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { document: emptyLayout(clean), warnings: [], writable: true };
    }
    if (error instanceof SyntaxError) {
      return {
        document: emptyLayout(clean),
        warnings: ["Layout sidecar is invalid."],
        writable: false,
      };
    }
    throw error;
  }
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, sortDeep(item)]),
    );
  }
  return value;
}

export async function saveNodePosition(
  workspaceRoot: string,
  source: string,
  view: string,
  tableId: string,
  position: Position,
): Promise<LayoutDocument> {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    tableId.trim().length === 0 ||
    view.trim().length === 0
  ) {
    throw new LayoutStoreError(
      "INVALID_POSITION",
      "Position, view, and table ID must be valid.",
    );
  }

  const target = await safeSidecarPath(workspaceRoot, source);
  return withSaveLock(target, async () => {
    const loaded = await loadLayout(workspaceRoot, source);
    if (!loaded.writable) {
      throw new LayoutStoreError(
        "INVALID_LAYOUT",
        "Repair the invalid layout before saving.",
      );
    }

    const nodes = {
      ...(loaded.document.views[view]?.nodes ?? {}),
      [tableId]: position,
    };
    const document: LayoutDocument = {
      ...loaded.document,
      views: {
        ...loaded.document.views,
        [view]: { nodes },
      },
    };
    await mkdir(dirname(target), { recursive: true });
    await safeSidecarPath(workspaceRoot, source);
    const canonicalParent = await realpath(dirname(target));
    const canonicalRoot = await realpath(workspaceRoot);
    if (escapes(canonicalRoot, canonicalParent)) {
      throw new LayoutStoreError(
        "OUTSIDE_WORKSPACE",
        "The layout sidecar must stay in the workspace.",
      );
    }
    await writeFileAtomic(
      target,
      `${JSON.stringify(sortDeep(document), null, 2)}\n`,
      { encoding: "utf8" },
    );
    return document;
  });
}
