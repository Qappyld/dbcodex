import { Parser } from "@dbml/core";
import type {
  Diagnostic,
  GraphColumn,
  GraphRelationEnd,
  ParseResult,
  SchemaGraph,
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
  try {
    const model = new Parser().parse(source, "dbmlv2").normalize();
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
            };
          })
          .sort((left: GraphColumn, right: GraphColumn) => compareText(left.id, right.id));

        return {
          id: tableId,
          schema: schema.name,
          name: table.name,
          columns,
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
          id: `ref:${reference.id}`,
          source: ends[0],
          target: ends[1],
        };
      })
      .sort((left, right) => compareText(left.id, right.id));

    const graph: SchemaGraph = {
      sourcePath,
      tables,
      relations,
    };

    return { graph, diagnostics: [] };
  } catch (error) {
    return {
      graph: null,
      diagnostics: parserDiagnostics(error),
    };
  }
}
