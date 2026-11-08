import assert from "node:assert/strict";
import { test } from "bun:test";
import { resolveChain } from "../../shared/agentSetup.ts";
import type { AgentSetupInventory, SetupFile, ToolChain } from "../../shared/agentSetup.ts";

const file = (id: string): SetupFile => ({ id, path: id, tools: ["claude"], scope: "project", kind: "instructions", status: "ok", sizeBytes: 1, imports: [], content: { type: "markdown", text: id, truncated: false }, issues: [] });
const chain = (tool: "claude" | "codex", over: Partial<ToolChain>): ToolChain => ({ tool, steps: [], mcpServerIds: [], shadowedMcpServerIds: [], hookIds: [], pluginIds: [], issues: [], ...over });
const server = (id: string) => ({ id, name: id, tool: "claude" as const, scope: "user" as const, sourceFileId: "/a", transport: "stdio" as const, command: null, args: [], url: null, env: [], headers: [], enabled: true, masked: false, projectIds: [], issues: [] });

const inventory: AgentSetupInventory = {
  readAt: "2026-01-01T00:00:00.000Z",
  home: "/h",
  dirs: { claude: "/h/.claude", claudeState: "/h/.claude.json", codex: "/h/.codex" },
  files: { "/a": file("/a"), "/b": file("/b") },
  userFileIds: [],
  projects: [
    {
      projectId: "p1",
      title: "P1",
      root: "/r",
      gitRoot: null,
      fileIds: [],
      claude: chain("claude", {
        steps: [
          { fileId: "/b", layer: "instructions", scope: "project", active: true },
          { fileId: "/gone", layer: "instructions", scope: "project", active: true },
          { fileId: "/a", layer: "settings", scope: "user", active: false, note: "why" },
        ],
        mcpServerIds: ["s2", "s1"],
        shadowedMcpServerIds: ["s3"],
        issues: [{ code: "truncated", severity: "info", message: "m" }],
      }),
      codex: chain("codex", {}),
    },
  ],
  mcpServers: [server("s1"), server("s2"), server("s3")],
  hooks: [],
  plugins: [],
  issues: [],
  partial: false,
};

test("resolveChain numbers the steps from 1 and fills in each file", () => {
  const resolved = resolveChain(inventory, "p1", "claude")!;
  assert.deepEqual(resolved.entries.map((e) => [e.order, e.path, e.layer, e.active, e.note]), [
    [1, "/b", "instructions", true, undefined],
    [2, "/a", "settings", false, "why"],
  ]);
  assert.equal(resolved.entries[0]!.content.type, "markdown");
  assert.equal(resolved.tool, "claude");
});

test("resolveChain resolves server ids in chain order, keeping shadowed ones apart", () => {
  const resolved = resolveChain(inventory, "p1", "claude")!;
  assert.deepEqual(resolved.mcpServers.map((s) => s.id), ["s2", "s1"]);
  assert.deepEqual(resolved.shadowedMcpServers.map((s) => s.id), ["s3"]);
  assert.deepEqual(resolved.issues.map((i) => i.code), ["truncated"]);
});

test("resolveChain returns null for an unknown project", () => {
  assert.equal(resolveChain(inventory, "nope", "codex"), null);
});
