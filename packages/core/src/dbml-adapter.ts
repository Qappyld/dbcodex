import { Parser } from "@dbml/core";
import type {
  GraphColumn,
  GraphRelationEnd,
  ParseResult,
  SchemaGraph,
} from "./schema-graph.js";

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
          .sort((left: GraphColumn, right: GraphColumn) =>
            left.id.localeCompare(right.id),
          );

        return {
          id: tableId,
          schema: schema.name,
          name: table.name,
          columns,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));

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
      .sort((left, right) => left.id.localeCompare(right.id));

    const graph: SchemaGraph = {
      sourcePath,
      tables,
      relations,
    };

    return { graph, diagnostics: [] };
  } catch {
    return {
      graph: null,
      diagnostics: [
        {
          severity: "error",
          message: "Unable to parse DBML.",
        },
      ],
    };
  }
}
