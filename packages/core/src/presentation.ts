import { z } from "zod";
import { projectModelSchema } from "./project-model.js";
import { assertJsonByteLimit, boundedUtf8Length, DBCD_MAX_PRESENTATION_BYTES } from "./dbcd-resource-limits.js";

const nonEmpty = z.string().min(1).refine((value) => value.trim().length > 0);
const detailLevelSchema = z.enum(["names", "keys", "all"]);
const positionSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
});
const nodeSchema = positionSchema.extend({
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
  detail: detailLevelSchema.optional(),
  hidden: z.boolean().optional(),
});
const groupSchema = z.strictObject({
  name: nonEmpty,
  color: nonEmpty,
  tableIds: z.array(nonEmpty),
  collapsed: z.boolean().optional(),
});
const edgeSchema = z.strictObject({
  points: z.array(positionSchema),
  format: z.literal("orthogonal").optional(),
  mode: z.enum(["manual", "automatic"]).optional(),
  sourceSide: z.enum(["left", "right"]).optional(),
  targetSide: z.enum(["left", "right"]).optional(),
});
const viewSchema = z.strictObject({
  name: nonEmpty,
  system: z.boolean(),
  defaultDetail: detailLevelSchema,
  nodes: z.record(nonEmpty, nodeSchema),
  groups: z.record(nonEmpty, groupSchema),
  edges: z.record(nonEmpty, edgeSchema),
  viewport: positionSchema.extend({ zoom: z.number().finite().min(0.1).max(4) }),
  notes: z.record(nonEmpty, positionSchema.extend({ text: z.string(), width: z.number().positive().optional() })).optional(),
});

export const presentationSchema = z.strictObject({
  version: z.literal(1),
  model: projectModelSchema.optional(),
  nameDisplay: z.enum(["display", "technical", "both"]).optional(),
  activeViewId: nonEmpty,
  views: z.record(nonEmpty, viewSchema),
  panels: z.strictObject({
    editor: z.number().finite().nonnegative(),
    inspector: z.number().finite().nonnegative(),
    editorCollapsed: z.boolean(),
    inspectorCollapsed: z.boolean(),
  }),
}).refine((value) => Object.keys(value.views).length > 0, "A presentation needs at least one view")
  .refine((value) => Object.hasOwn(value.views, value.activeViewId), "The active view must exist")
  .refine((value) => Object.hasOwn(value.views, "all") && value.views.all?.system === true, "The all-tables system view must exist");

export type DetailLevel = "names" | "keys" | "all";
export type PresentationDocument = z.infer<typeof presentationSchema>;

export function emptyPresentation(): PresentationDocument {
  return {
    version: 1,
    activeViewId: "all",
    views: {
      all: {
        name: "Toutes les tables",
        system: true,
        defaultDetail: "keys",
        nodes: {}, groups: {}, edges: {},
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    panels: { editor: 320, inspector: 280, editorCollapsed: false, inspectorCollapsed: false },
  };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, sortObject(item)]),
    );
  }
  return value;
}

export function encodePresentation(value: PresentationDocument): string {
  assertJsonByteLimit(value, DBCD_MAX_PRESENTATION_BYTES);
  return JSON.stringify(sortObject(presentationSchema.parse(value)));
}

export function decodePresentation(value: string): PresentationDocument {
  boundedUtf8Length(value, DBCD_MAX_PRESENTATION_BYTES);
  return presentationSchema.parse(JSON.parse(value) as unknown);
}
