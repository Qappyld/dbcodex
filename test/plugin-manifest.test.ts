import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

async function json(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8")) as Record<string, unknown>;
}

describe("Codex plugin package", () => {
  it("keeps portable and Codex-compatible manifests aligned", async () => {
    const portable = await json("plugin.json");
    const compatible = await json(".codex-plugin/plugin.json");

    expect(portable).toMatchObject({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "dbcodex",
    });
    expect(portable.version).toMatch(/^0\.1\.0-dev\.0(?:\+codex\.[0-9]+)?$/);
    expect(portable).not.toHaveProperty("license");
    expect(compatible).toMatchObject({
      name: "dbcodex",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
    });
    expect(compatible.version).toBe(portable.version);
    expect(compatible.description).toBe(portable.description);
    expect(compatible.interface).toEqual((portable.extensions as { "com.openai": { interface: unknown } })["com.openai"].interface);
  });

  it("declares the same local stdio server in both MCP formats", async () => {
    const portable = await json("mcp.json");
    const compatible = await json(".mcp.json");
    const servers = portable.mcpServers as Record<string, { type: string; command: string; args: string[] }>;

    expect(portable.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    expect(compatible.mcpServers).toEqual(portable.mcpServers);
    expect(servers.dbcodex).toEqual({
      type: "stdio",
      command: "node",
      args: ["${PLUGIN_ROOT}/packages/mcp/dist/index.js", "--trust-cwd-as-workspace"],
    });
    expect(JSON.stringify(servers.dbcodex)).not.toMatch(/https?:\/\//);
  });

  it("exposes the repository root in its local marketplace", async () => {
    const marketplace = await json(".agents/plugins/marketplace.json");

    expect(marketplace).toMatchObject({
      name: "dbcodex-local",
      plugins: [{
        name: "dbcodex",
        source: { source: "local", path: "./" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      }],
    });
    expect(await readFile(path.join(root, ".codex/config.toml"), "utf8"))
      .toContain('[plugins."dbcodex@dbcodex-local"]');
  });

  it("ships editable project guidance and the three exact user flows", async () => {
    const skill = await readFile(path.join(root, "skills/dbcodex/SKILL.md"), "utf8");

    expect(skill).toMatch(/^---\r?\nname: dbcodex\r?\n/m);
    expect(skill).toContain("open_dbml");
    expect(skill).toContain("save_layout");
    expect(skill).toContain("workspace-relative");
    const readme = await readFile(path.join(root, "README.md"), "utf8");
    for (const flow of ["Ouvre fixtures/demo-shop.dbcd avec dbcodex.", "Importe fixtures/demo-shop.dbml dans fixtures/demo-shop.dbcd.", "Exporte la version courante de fixtures/demo-shop.dbcd vers fixtures/demo-shop-export.dbml."]) {
      expect(skill).toContain(flow);
      expect(readme).toContain(flow);
    }
    expect(skill).toContain("open_dbcd");
    expect(skill).toContain("read_dbcd_revision");
    expect(JSON.stringify(await json("plugin.json"))).toContain("demo-shop.dbcd");
  });
});
