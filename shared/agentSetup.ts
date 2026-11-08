// The agent setup inventory: the files, MCP servers and hooks Claude and Codex load, per project.
export type AgentTool = "claude" | "codex";
/** "local" = Claude's per-user, per-project layer (.claude.json projects[path], CLAUDE.local.md, settings.local.json). */
export type SetupScope = "managed" | "user" | "project" | "local";

export type SetupFileKind =
  | "instructions" // CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md, AGENTS.md, AGENTS.override.md
  | "import"       // pulled in by an @path line
  | "rule"         // .claude/rules/**/*.md
  | "settings"     // Claude settings.json / settings.local.json
  | "state"        // Claude .claude.json: only MCP servers are read, content never sent
  | "mcp"          // .mcp.json
  | "config"       // Codex config.toml
  | "hooks"        // Codex hooks.json
  | "skill" | "agent" | "command";

export type SetupFileStatus = "ok" | "broken-symlink" | "unreadable" | "invalid" | "too-large";

export type SetupIssueCode =
  | "broken-import" | "import-depth" | "broken-symlink" | "unreadable" | "invalid-json" | "invalid-toml"
  | "too-large" | "truncated" | "over-codex-limit" | "url-without-type" | "agents-md-ignored" | "not-trusted";

export interface SetupIssue {
  code: SetupIssueCode;
  severity: "error" | "warning" | "info";
  /** Plain text; never contains a config value. */
  message: string;
  /** The path the issue points at (e.g. the missing import), when it is not the carrying file. */
  path?: string;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type SetupContent =
  | { type: "markdown"; text: string; truncated: boolean }          // sent as-is (instructions)
  | { type: "data"; format: "json" | "toml"; value: JsonValue }     // parsed, then masked server-side
  | { type: "fields"; fields: { key: string; value: string }[] }    // skill/agent/command frontmatter, masked
  | { type: "omitted"; reason: "private" | "too-large" | "budget" | "unreadable" };

export interface SetupFile {
  /** The absolute path; unique in the inventory. */
  id: string;
  path: string;
  tools: AgentTool[];
  /** The scope of its first discovery (an import takes its importer's scope). */
  scope: SetupScope;
  kind: SetupFileKind;
  /** Skill/agent/command: frontmatter `name`, else folder or file name. */
  name?: string;
  description?: string;
  status: SetupFileStatus;
  /** Set when the path is a symlink: the target as written. */
  linkTarget?: string;
  sizeBytes: number | null;
  /** Resolved @imports, in order (file ids). Missing ones are "broken-import" issues instead. */
  imports: string[];
  content: SetupContent;
  issues: SetupIssue[];
}

export type McpTransport = "stdio" | "http" | "sse" | "ws" | "unknown";

export interface McpServer {
  /** `${tool}:${scope}:${sourceFileId}#${name}`; Claude local scope: `claude:local:${stateFile}@${projectPath}#${name}`. */
  id: string;
  name: string;
  tool: AgentTool;
  scope: SetupScope;
  sourceFileId: string;
  transport: McpTransport;
  command: string | null;                     // masked
  args: string[];                             // masked
  url: string | null;                         // masked
  env: { key: string; value: string }[];      // values masked
  headers: { key: string; value: string }[];  // masked; Codex env_http_headers / bearer_token_env_var shown as "$VAR"
  enabled: boolean;                           // Codex `enabled = false` => false
  /** True when at least one value was masked. */
  masked: boolean;
  /** T3 projects whose effective chain includes it; [] for user scope (= every project). */
  projectIds: string[];
  issues: SetupIssue[];
}

export interface HookRow {
  id: string;                 // `${sourceFileId}#${event}#${groupIndex}.${handlerIndex}`
  tool: AgentTool;
  scope: SetupScope;
  sourceFileId: string;
  event: string;
  matcher: string | null;
  type: string;               // command | http | mcp_tool | prompt | agent | other raw value
  target: string;             // masked command / url / tool name / first line of prompt (<= 200 chars)
  timeoutSec: number | null;
}

export interface PluginRow {
  id: string;                 // `${sourceFileId}#${plugin}`
  plugin: string;             // "name@marketplace"
  enabled: boolean;
  scope: SetupScope;
  sourceFileId: string;
}

export type ChainLayer = "instructions" | "settings" | "mcp" | "config" | "hooks" | "skills" | "agents" | "commands";

export interface ChainStep {
  fileId: string;
  layer: ChainLayer;
  /** May differ from the file's scope (.claude.json is a "user" step and a "local" step). */
  scope: SetupScope;
  /** False when the tool skips this file for this project; `note` says why. */
  active: boolean;
  note?: string;              // e.g. "imported by ~/.claude/CLAUDE.md", "project not trusted by Codex"
}

export interface ToolChain {
  tool: AgentTool;
  /** Load order, earliest first. For settings/config later steps override earlier ones. */
  steps: ChainStep[];
  /** Effective servers after name precedence, and the ones a same-name server hides. */
  mcpServerIds: string[];
  shadowedMcpServerIds: string[];
  hookIds: string[];
  /** Claude: plugins enabled after merging settings layers; Codex: []. */
  pluginIds: string[];
  issues: SetupIssue[];
}

export interface ProjectSetup {
  projectId: string;
  title: string;
  root: string;               // workspaceRoot
  gitRoot: string | null;     // nearest ancestor-or-self holding `.git` (file or dir)
  /** Project/local scope files found for this project, ancestors included, display order. */
  fileIds: string[];
  claude: ToolChain;
  codex: ToolChain;
}

export interface AgentSetupInventory {
  readAt: string;
  home: string;               // the web shows paths under it as "~/..."
  dirs: { claude: string; claudeState: string; codex: string };
  files: Record<string, SetupFile>;
  /** Managed + user scope files, display order. */
  userFileIds: string[];
  projects: ProjectSetup[];
  mcpServers: McpServer[];
  hooks: HookRow[];
  plugins: PluginRow[];
  issues: SetupIssue[];
  /** The content budget ran out: some files have content { type: "omitted", reason: "budget" }. */
  partial: boolean;
}

/** One project's chain for one tool, self-contained: the input of the future audit agent. */
export interface ResolvedChainEntry extends ChainStep {
  order: number;              // 1-based
  tool: AgentTool;
  path: string;
  kind: SetupFileKind;
  content: SetupContent;
  issues: SetupIssue[];
}
export interface ResolvedChain {
  projectId: string; title: string; root: string; gitRoot: string | null; tool: AgentTool;
  entries: ResolvedChainEntry[];
  mcpServers: McpServer[];
  shadowedMcpServers: McpServer[];
  hooks: HookRow[];
  plugins: PluginRow[];
  issues: SetupIssue[];
}

export function resolveChain(inventory: AgentSetupInventory, projectId: string, tool: AgentTool): ResolvedChain | null {
  const project = inventory.projects.find((p) => p.projectId === projectId);
  if (!project) return null;
  const chain = project[tool];
  // A step whose file is gone from the inventory is dropped, so the order stays contiguous.
  const entries: ResolvedChainEntry[] = [];
  for (const step of chain.steps) {
    const file = inventory.files[step.fileId];
    if (file) entries.push({ ...step, order: entries.length + 1, tool, path: file.path, kind: file.kind, content: file.content, issues: file.issues });
  }
  const pick = <T extends { id: string }>(all: T[], ids: string[]): T[] => ids.flatMap((id) => all.find((item) => item.id === id) ?? []);
  return {
    projectId: project.projectId,
    title: project.title,
    root: project.root,
    gitRoot: project.gitRoot,
    tool,
    entries,
    mcpServers: pick(inventory.mcpServers, chain.mcpServerIds),
    shadowedMcpServers: pick(inventory.mcpServers, chain.shadowedMcpServerIds),
    hooks: pick(inventory.hooks, chain.hookIds),
    plugins: pick(inventory.plugins, chain.pluginIds),
    issues: chain.issues,
  };
}

// ---- MCP status (route owned by chunk 2) ----
export type McpStatus = "configured" | "reachable" | "failing" | "needs-auth" | "disabled";
export interface McpServerStatus {
  serverId: string;           // McpServer.id
  name: string; tool: AgentTool; scope: SetupScope; transport: McpTransport;
  /** Masked URL, or masked command + args, <= 200 chars. */
  target: string;
  projectIds: string[];
  status: McpStatus;
  /** HTTP code, error code or CLI status label; never text from the config or the server. */
  detail: string | null;
  source: "config" | "http" | "claude-cli";
  checkedAt: string | null;
}
export interface McpOverview {
  servers: McpServerStatus[];   // order: scope (user, project, local, managed), then tool, then name
  readAt: string;
  cli: { available: boolean; ranAt: string | null; error: string | null };
}
