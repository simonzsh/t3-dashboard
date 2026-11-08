import type { AgentSetupInventory, McpServer, SetupFile } from "../../../../shared/api.ts";

export function setupFile(path: string, over: Partial<SetupFile> = {}): SetupFile {
  return { id: path, path, tools: ["claude"], scope: "user", kind: "instructions", status: "ok", sizeBytes: 10, imports: [], content: { type: "markdown", text: "# Hello", truncated: false }, issues: [], ...over };
}

export function mcpServer(over: Partial<McpServer> = {}): McpServer {
  return { id: "claude:user:/home/u/.claude.json#docs", name: "docs", tool: "claude", scope: "user", sourceFileId: "/home/u/.claude.json", transport: "http", command: null, args: [], url: "https://mcp.example.com/mcp", env: [], headers: [{ key: "Authorization", value: "Bearer ••••••" }], enabled: true, masked: true, projectIds: [], issues: [], ...over };
}

/** User files, one project (p1) with Claude and Codex chains, and one MCP server. */
export function inventory(): AgentSetupInventory {
  const files = [
    setupFile("/home/u/.claude/CLAUDE.md"),
    setupFile("/home/u/.claude.json", { kind: "state", content: { type: "omitted", reason: "private" } }),
    setupFile("/home/u/src/web/CLAUDE.md", { scope: "project", imports: ["/home/u/src/web/AGENTS.md"] }),
    setupFile("/home/u/src/web/AGENTS.md", { scope: "project", tools: ["claude", "codex"] }),
  ];
  const server = mcpServer();
  return {
    readAt: "2026-11-08T10:00:00.000Z",
    home: "/home/u",
    dirs: { claude: "/home/u/.claude", claudeState: "/home/u/.claude.json", codex: "/home/u/.codex" },
    files: Object.fromEntries(files.map((f) => [f.id, f])),
    userFileIds: ["/home/u/.claude/CLAUDE.md", "/home/u/.claude.json"],
    projects: [
      {
        projectId: "p1",
        title: "Web",
        root: "/home/u/src/web",
        gitRoot: "/home/u/src/web",
        fileIds: ["/home/u/src/web/CLAUDE.md", "/home/u/src/web/AGENTS.md"],
        claude: {
          tool: "claude",
          steps: [
            { fileId: "/home/u/.claude/CLAUDE.md", layer: "instructions", scope: "user", active: true },
            { fileId: "/home/u/src/web/CLAUDE.md", layer: "instructions", scope: "project", active: true },
            { fileId: "/home/u/src/web/AGENTS.md", layer: "instructions", scope: "project", active: false, note: "Claude reads CLAUDE.md only" },
          ],
          mcpServerIds: [server.id],
          shadowedMcpServerIds: [],
          hookIds: [],
          pluginIds: [],
          issues: [],
        },
        codex: { tool: "codex", steps: [], mcpServerIds: [], shadowedMcpServerIds: [], hookIds: [], pluginIds: [], issues: [] },
      },
    ],
    mcpServers: [server],
    hooks: [],
    plugins: [],
    issues: [],
    partial: false,
  };
}
