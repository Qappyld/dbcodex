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
      version: "0.1.0-dev.0",
    });
    expect(portable).not.toHaveProperty("license");
    expect(compatible).toMatchObject({
      name: "dbcodex",
      version: "0.1.0-dev.0",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
    });
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
      args: ["${PLUGIN_ROOT}/packages/mcp/dist/index.js"],
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

  it("ships a focused skill for both tools", async () => {
    const skill = await readFile(path.join(root, "skills/dbcodex/SKILL.md"), "utf8");

    expect(skill).toMatch(/^---\r?\nname: dbcodex\r?\n/m);
    expect(skill).toContain("open_dbml");
    expect(skill).toContain("save_layout");
    expect(skill).toContain("workspace-relative");
  });
});
