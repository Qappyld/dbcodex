import { Parser } from "@dbml/core";
import { boundedUtf8Length, DBCD_MAX_SOURCE_BYTES } from "./dbcd-resource-limits.js";
import type {
  Diagnostic,
  GraphColumn,
  GraphRelationEnd,
  ParseResult,
  SchemaGraph,
  SourceRange,
} from "./schema-graph.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parserDiagnostics(error: unknown): Diagnostic[] {
  if (!error || typeof error !== "object" || !("diags" in error)) {
    return [{ severity: "error", message: "Unable to parse DBML." }];
  }
  const raw = (error as { diags?: unknown }).diags;
  if (!Array.isArray(raw)) {
    return [{ severity: "error", message: "Unable to parse DBML." }];
  }

  const diagnostics = raw.slice(0, 20).flatMap((item): Diagnostic[] => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const diagnostic = item as {
      code?: unknown;
      location?: {
        start?: { line?: unknown; column?: unknown };
        end?: { line?: unknown; column?: unknown };
      };
    };
    const code = typeof diagnostic.code === "number" || typeof diagnostic.code === "string"
      ? diagnostic.code
      : undefined;
    const start = diagnostic.location?.start;
    const end = diagnostic.location?.end;
    const validStart = typeof start?.line === "number" && typeof start.column === "number";
    const validEnd = typeof end?.line === "number" && typeof end.column === "number";
    return [{
      severity: "error",
      message: "Unable to parse DBML.",
      ...(code === undefined ? {} : { code }),
      ...(validStart ? {
        location: {
          start: { line: start.line as number, column: start.column as number },
          ...(validEnd ? {
            end: { line: end.line as number, column: end.column as number },
          } : {}),
        },
      } : {}),
    }];
  });
  return diagnostics.length > 0
    ? diagnostics
    : [{ severity: "error", message: "Unable to parse DBML." }];
}

function canonicalTableId(schemaName: string | null, tableName: string): string {
  return `${schemaName ?? "public"}.${tableName}`;
}

export function parseDbml(source: string, sourcePath: string): ParseResult {
  boundedUtf8Length(source, DBCD_MAX_SOURCE_BYTES);
  try {
    const parsed = new Parser().parse(source, "dbmlv2");
    const model = parsed.normalize();
    const lineStarts = [0];
    for (let offset = 0; offset < source.length; offset++) if (source[offset] === "\n") lineStarts.push(offset + 1);
    const range = (token: unknown): SourceRange | undefined => {
      const raw = token as { start?: { line: number; column: number }; end?: { line: number; column: number } } | undefined;
      if (!raw?.start || !raw.end) return undefined;
      const point = ({ line, column }: { line: number; column: number }) => ({ line, column,
        offset: Math.min(source.length, (lineStarts[line - 1] ?? source.length) + column - 1) });
      return { start: point(raw.start), end: point(raw.end) };
    };
    const tableTokens = new Map(parsed.schemas.flatMap((schema) => schema.tables.map((table) => [table.id, table] as const)));
    const referenceTokens = new Map(parsed.schemas.flatMap((schema) => schema.refs.map((ref) => [ref.id, ref.token] as const)));
    const groupTokens = new Map(parsed.schemas.flatMap((schema) => schema.tableGroups.map((group) => [group.id, group.token] as const)));
    const schemas = new Map(
      Object.values(model.schemas).map((schema) => [schema.id, schema] as const),
    );

    const tables = Object.values(model.tables)
      .map((table) => {
        const schema = schemas.get(table.schemaId);
        if (!schema) {
          throw new Error("Parsed table has no schema.");
        }

        const tableId = canonicalTableId(schema.name, table.name);
        const columns = table.fieldIds
          .map((fieldId: number): GraphColumn => {
            const field = model.fields[fieldId];
            if (!field) {
              throw new Error("Parsed table has a missing field.");
            }

            return {
              id: `${tableId}.${field.name}`,
              name: field.name,
              type: field.type.type_name,
              primaryKey: field.pk,
              nullable: !field.not_null,
              sourceRange: range(tableTokens.get(table.id)?.fields.find((item) => item.id === fieldId)?.token),
            };
          })
          .sort((left: GraphColumn, right: GraphColumn) => compareText(left.id, right.id));

        return {
          id: tableId,
          schema: schema.name,
          name: table.name,
          ...(tableTokens.get(table.id)?.headerColor ? { headerColor: tableTokens.get(table.id)!.headerColor } : {}),
          columns,
          sourceRange: range(tableTokens.get(table.id)?.token),
        };
      })
      .sort((left, right) => compareText(left.id, right.id));

    const relations = Object.values(model.refs)
      .map((reference) => {
        const ends = reference.endpointIds.map((endpointId: number): GraphRelationEnd => {
          const endpoint = model.endpoints[endpointId];
          if (!endpoint) {
            throw new Error("Parsed relation has a missing endpoint.");
          }

          return {
            tableId: canonicalTableId(endpoint.schemaName, endpoint.tableName),
            columnNames: [...endpoint.fieldNames],
            cardinality: endpoint.relation,
          };
        });

        if (ends.length !== 2 || !ends[0] || !ends[1]) {
          throw new Error("Parsed relation must have two endpoints.");
        }

        return {
          // A length-preserving tuple encoding has no hash or concatenation collisions.
          // Parser ordinals change whenever an unrelated declaration is inserted.
          id: `ref:${encodeURIComponent(JSON.stringify([schemas.get(reference.schemaId)?.name ?? "public", reference.name ?? null,
            reference.endpointIds.map((id: number) => { const end = model.endpoints[id]!; return [end.schemaName ?? "public", end.tableName, end.fieldNames, end.relation]; })]))}`,
          source: ends[0],
          target: ends[1],
          sourceRange: range(referenceTokens.get(reference.id)),
        };
      });

    const tableGroups: NonNullable<SchemaGraph["tableGroups"]> = Object.values(model.tableGroups).map((group) => {
      const schema = schemas.get(group.schemaId)?.name ?? "public";
      return { id: schema === "public" ? group.name : `${schema}.${group.name}`, name: group.name,
        tableIds: group.tableIds.map((id: number) => { const table = model.tables[id]!; return canonicalTableId(schemas.get(table.schemaId)?.name ?? null, table.name); }).sort(compareText),
        ...(group.color ? { color: group.color } : {}), sourceRange: range(groupTokens.get(group.id)) };
    });
    const views: NonNullable<SchemaGraph["views"]> = parsed.diagramViews.map((view) => {
      const entities = view.visibleEntities;
      const members = new Set<string>((entities.tables ?? []).map((table) => canonicalTableId(table.schemaName, table.name)));
      for (const item of entities.tableGroups ?? []) {
        const id = item.name;
        for (const table of tableGroups.find((group) => group.id === id)?.tableIds ?? []) members.add(table);
      }
      for (const schema of entities.schemas ?? []) for (const table of tables) if (table.schema === schema.name) members.add(table.id);
      return { id: !view.schemaName || view.schemaName === "public" ? view.name : `${view.schemaName}.${view.name}`,
        name: view.name, tableIds: [...members].sort(compareText), sourceRange: range(view.token) };
    });

    const graph: SchemaGraph = {
      sourcePath,
      tables,
      relations,
      tableGroups,
      views,
    };

    return { graph, diagnostics: [] };
  } catch (error) {
    return {
      graph: null,
      diagnostics: parserDiagnostics(error),
    };
  }
}
