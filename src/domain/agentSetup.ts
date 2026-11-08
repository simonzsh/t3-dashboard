import { posix } from "node:path";
import type { AgentSetupInventory, AgentTool, ChainLayer, ChainStep, HookRow, JsonValue, McpServer, PluginRow, ProjectSetup, SetupFile, SetupFileKind, SetupIssue, SetupScope, ToolChain } from "../../shared/agentSetup.ts";
import type { DashboardProject } from "../../shared/api.ts";
import { extractImports, localMcpServers, mcpServersOf, parseClaudeSettings, parseCodexConfig, parseFrontmatter, parseHooks, parseJson, parseToml } from "../config/agentConfigFiles.ts";
import type { JsonObject, RawHook } from "../config/agentConfigFiles.ts";
import type { SetupFs } from "../config/agentSetupFs.ts";
import { agentsSkillsDir, claudeConfigDir, claudeStateFile, codexHome, managedClaudeMd } from "../config/paths.ts";
import { normalizeFolder } from "./folders.ts";
import { maskMarkdown } from "./secretMask.ts";
import { dataContent, fieldsContent, toHookRow, toMcpServer } from "./setupRows.ts";

export const MAX_MARKDOWN_BYTES = 65_536;
export const CONTENT_BUDGET_BYTES = 2 * 1024 * 1024;
export const MAX_CONFIG_BYTES = 1_048_576;
export const MAX_STATE_BYTES = 16 * 1024 * 1024;
const FRONTMATTER_BYTES = 8 * 1024;
const MAX_LIST_ENTRIES = 200;
const MAX_LIST_DEPTH = 4;
const MAX_IMPORT_HOPS = 4;
const CODEX_DOC_LIMIT_DEFAULT = 32_768;
const CACHE_MS = 30_000;

export interface AgentSetupOptions {
  fs: SetupFs;
  env: Record<string, string | undefined>;
  home: string;
  platform: NodeJS.Platform;
  projects: () => DashboardProject[];
  now: () => Date;
}

type Format = "markdown" | "json" | "toml" | "state" | "frontmatter" | "private";
interface Spec {
  kind: SetupFileKind;
  scope: SetupScope;
  format: Format;
}
interface Loaded {
  file: SetupFile;
  text?: string;
  json?: JsonValue;
  importPaths: string[];
}
interface Project {
  id: string;
  title: string;
  root: string;
  gitRoot: string | null;
}

const issue = (code: SetupIssue["code"], severity: SetupIssue["severity"], message: string, path?: string): SetupIssue => ({ code, severity, message, ...(path === undefined ? {} : { path }) });

function addIssue(file: { issues: SetupIssue[] }, next: SetupIssue): void {
  if (!file.issues.some((have) => have.code === next.code && have.path === next.path)) file.issues.push(next);
}

/** Directories from the filesystem root down to `dir`, both included. */
function ancestors(dir: string): string[] {
  const parts = dir.split("/").filter(Boolean);
  return ["/", ...parts.map((_, at) => `/${parts.slice(0, at + 1).join("/")}`)];
}

const within = (dir: string, top: string): boolean => dir === top || dir.startsWith(top === "/" ? "/" : `${top}/`);

class Reader {
  readonly files = new Map<string, SetupFile>();
  readonly servers = new Map<string, McpServer>();
  readonly hooks = new Map<string, HookRow>();
  readonly plugins = new Map<string, PluginRow>();
  partial = false;
  private readonly cache = new Map<string, Loaded | null>();
  private markdownBytes = 0;
  private readonly o: AgentSetupOptions;

  constructor(o: AgentSetupOptions) {
    this.o = o;
  }

  /** Loads a file once; a later use adds its tool. `active` false: the tool lists the file but does not read it. */
  async load(path: string, spec: Spec, tool: AgentTool, active = true): Promise<Loaded | null> {
    // The same file can be an import node and a parsed config: the cache holds one load per format.
    const key = `${spec.format}\0${path}`;
    if (!this.cache.has(key)) {
      const loaded = await this.read(path, spec);
      this.cache.set(key, loaded);
      if (loaded) this.register(path, loaded.file, spec.format);
    }
    const loaded = this.cache.get(key) ?? null;
    // The published node may be another object than the cached one (a frontmatter load replaced it).
    const node = loaded ? (this.files.get(path) ?? loaded.file) : null;
    if (node && active && !node.tools.includes(tool)) node.tools.push(tool);
    // An import found first is still an instruction file for the tool that reads it as one.
    if (loaded && loaded.file.kind === "import" && spec.kind !== "import") loaded.file.kind = spec.kind;
    return loaded;
  }

  /** One node per path: a structured load replaces a text or private one and keeps its tools. */
  private register(path: string, file: SetupFile, format: Format): void {
    const old = this.files.get(path);
    if (!old) {
      this.files.set(path, file);
      return;
    }
    if (format === "json" || format === "toml" || format === "state" || (format === "frontmatter" && old.kind === "import")) {
      for (const tool of old.tools) if (!file.tools.includes(tool)) file.tools.push(tool);
      this.files.set(path, file);
    }
  }

  private async read(path: string, spec: Spec): Promise<Loaded | null> {
    const entry = await this.o.fs.entry(path);
    if (!entry || (entry.kind !== "file" && entry.kind !== "missing")) return null;
    const file: SetupFile = {
      id: path,
      path,
      tools: [],
      scope: spec.scope,
      kind: spec.kind,
      status: "ok",
      ...(entry.symlink && entry.linkTarget !== undefined ? { linkTarget: entry.linkTarget } : {}),
      sizeBytes: entry.kind === "file" ? entry.size : null,
      imports: [],
      content: { type: "omitted", reason: "unreadable" },
      issues: [],
    };
    const loaded: Loaded = { file, importPaths: [] };
    if (entry.kind === "missing") {
      file.status = "broken-symlink";
      addIssue(file, issue("broken-symlink", "warning", "The link points to a file that does not exist."));
      return loaded;
    }
    if (spec.format === "private") {
      file.content = { type: "omitted", reason: "private" };
      return loaded;
    }
    const limit = spec.format === "state" ? MAX_STATE_BYTES : spec.format === "json" || spec.format === "toml" ? MAX_CONFIG_BYTES : spec.format === "frontmatter" ? FRONTMATTER_BYTES : MAX_MARKDOWN_BYTES;
    if ((spec.format === "json" || spec.format === "toml" || spec.format === "state") && entry.size > limit) {
      file.status = "too-large";
      file.content = { type: "omitted", reason: spec.format === "state" ? "private" : "too-large" };
      addIssue(file, issue("too-large", "warning", "The file is too large to read."));
      return loaded;
    }
    let read: { text: string; truncated: boolean };
    try {
      read = await this.o.fs.readText(path, limit);
    } catch {
      file.status = "unreadable";
      addIssue(file, issue("unreadable", "error", "The file cannot be read."));
      return loaded;
    }
    loaded.text = read.text;
    if (spec.format === "markdown") this.markdown(loaded, read);
    else if (spec.format === "frontmatter") this.frontmatter(loaded);
    else this.structured(loaded, spec.format, read.text);
    return loaded;
  }

  private markdown(loaded: Loaded, read: { text: string; truncated: boolean }): void {
    const { file } = loaded;
    loaded.importPaths = extractImports(read.text);
    if (read.truncated) addIssue(file, issue("truncated", "info", `The file is longer than ${MAX_MARKDOWN_BYTES / 1024} KiB: only the start is shown.`));
    const size = Buffer.byteLength(read.text);
    if (this.markdownBytes + size > CONTENT_BUDGET_BYTES) {
      this.partial = true;
      file.content = { type: "omitted", reason: "budget" };
      return;
    }
    this.markdownBytes += size;
    file.content = { type: "markdown", text: maskMarkdown(read.text), truncated: read.truncated };
  }

  private frontmatter(loaded: Loaded): void {
    const { file } = loaded;
    const fields = parseFrontmatter(loaded.text ?? "");
    const fallback = file.kind === "skill" ? posix.basename(posix.dirname(file.path)) : posix.basename(file.path).replace(/\.md$/, "");
    const content = fieldsContent(fields);
    file.content = content;
    file.name = fields.name || fallback;
    const description = content.fields.find((field) => field.key === "description")?.value;
    if (description) file.description = description;
  }

  private structured(loaded: Loaded, format: "json" | "toml" | "state", text: string): void {
    const { file } = loaded;
    const parsed = format === "toml" ? parseToml(text) : parseJson(text);
    if (!parsed.ok) {
      file.status = "invalid";
      file.content = { type: "omitted", reason: format === "state" ? "private" : "unreadable" };
      addIssue(file, format === "toml" ? issue("invalid-toml", "error", "The file is not valid TOML.") : issue("invalid-json", "error", "The file is not valid JSON."));
      return;
    }
    loaded.json = parsed.value;
    // The raw text is not kept: only parsed and masked data can leave the server.
    delete loaded.text;
    if (format === "state") {
      file.content = { type: "omitted", reason: "private" };
      return;
    }
    const content = dataContent(parsed.value, format);
    file.content = content ?? { type: "omitted", reason: "too-large" };
    if (!content) addIssue(file, issue("too-large", "warning", "The parsed data is too large to show."));
  }
}

// Only prose is sent as text; .env, JSON, TOML and dotfiles may hold secrets.
const isTextFile = (path: string): boolean => {
  const name = posix.basename(path);
  return /\.(md|markdown|txt)$/i.test(name);
};

const step = (loaded: Loaded, layer: ChainLayer, scope: SetupScope, active = true, note?: string): ChainStep => ({ fileId: loaded.file.id, layer, scope, active, ...(note === undefined ? {} : { note }) });

class Inventory {
  private readonly reader: Reader;
  private readonly o: AgentSetupOptions;

  constructor(o: AgentSetupOptions) {
    this.o = o;
    this.reader = new Reader(o);
  }

  private get fs() {
    return this.o.fs;
  }

  async build(): Promise<AgentSetupInventory> {
    // Files used by a project come second, so a user file keeps its user scope.
    const dirs = { claude: claudeConfigDir(this.o.env, this.o.home), claudeState: claudeStateFile(this.o.env, this.o.home), codex: codexHome(this.o.env, this.o.home) };
    await this.claude(null);
    await this.codex(null);
    const userFileIds = [...this.reader.files.values()].filter((file) => file.scope === "user" || file.scope === "managed").map((file) => file.id);
    const projects: ProjectSetup[] = [];
    for (const raw of this.o.projects()) {
      if (raw.archived || !raw.workspaceRoot) continue;
      const root = normalizeFolder(raw.workspaceRoot, this.o.home);
      const project: Project = { id: raw.id, title: raw.title, root, gitRoot: await this.gitRoot(root) };
      const claude = await this.claude(project);
      const codex = await this.codex(project);
      const fileIds = [...new Set([...claude.steps, ...codex.steps].map((entry) => entry.fileId))].filter((id) => {
        const scope = this.reader.files.get(id)?.scope;
        return scope === "project" || scope === "local";
      });
      projects.push({ projectId: project.id, title: project.title, root, gitRoot: project.gitRoot, fileIds, claude, codex });
    }
    return {
      readAt: this.o.now().toISOString(),
      home: this.o.home,
      dirs,
      files: Object.fromEntries(this.reader.files),
      userFileIds,
      projects,
      mcpServers: [...this.reader.servers.values()],
      hooks: [...this.reader.hooks.values()],
      plugins: [...this.reader.plugins.values()],
      issues: [],
      partial: this.reader.partial,
    };
  }

  private async gitRoot(root: string): Promise<string | null> {
    for (const dir of ancestors(root).reverse()) {
      if (await this.fs.entry(posix.join(dir, ".git"))) return dir;
    }
    return null;
  }

  private registerServers(loaded: Loaded, tool: AgentTool, scope: SetupScope, raw: Record<string, JsonObject>, project: Project | null, localRoot?: string): McpServer[] {
    return Object.entries(raw).map(([name, entry]) => {
      const id = `${tool}:${scope}:${loaded.file.id}${localRoot === undefined ? "" : `@${localRoot}`}#${name}`;
      let server = this.reader.servers.get(id);
      if (!server) {
        server = toMcpServer(entry, { id, name, tool, scope, sourceFileId: loaded.file.id, projectIds: [] });
        this.reader.servers.set(id, server);
      }
      if (project && scope !== "user" && !server.projectIds.includes(project.id)) server.projectIds.push(project.id);
      return server;
    });
  }

  private registerHooks(loaded: Loaded, tool: AgentTool, scope: SetupScope, raw: RawHook[]): string[] {
    return raw.map((hook) => {
      const row = toHookRow(hook, { tool, scope, sourceFileId: loaded.file.id });
      if (!this.reader.hooks.has(row.id)) this.reader.hooks.set(row.id, row);
      return row.id;
    });
  }

  /** A listed folder: at most 200 names. */
  private async names(dir: string): Promise<string[]> {
    return (await this.fs.list(dir)).slice(0, MAX_LIST_ENTRIES);
  }

  private async markdownFiles(dir: string, depth = 0): Promise<string[]> {
    const found: string[] = [];
    for (const name of await this.names(dir)) {
      const path = posix.join(dir, name);
      const entry = await this.fs.entry(path);
      if (!entry) continue;
      if (entry.kind === "dir") {
        if (depth < MAX_LIST_DEPTH) found.push(...(await this.markdownFiles(path, depth + 1)));
      } else if (name.endsWith(".md")) {
        found.push(path);
      }
    }
    return found;
  }

  /** One step per skill folder, agent file or command file; `.name` folders are tool data. */
  private async catalog(dir: string, kind: "skill" | "agent" | "command", scope: SetupScope, tool: AgentTool, layer: ChainLayer, steps: ChainStep[], note?: string): Promise<void> {
    const paths = kind === "skill" ? (await this.names(dir)).filter((name) => !name.startsWith(".")).map((name) => posix.join(dir, name, "SKILL.md")) : await this.markdownFiles(dir);
    for (const path of paths) {
      const loaded = await this.reader.load(path, { kind, scope, format: "frontmatter" }, tool);
      if (loaded) steps.push(step(loaded, layer, scope, true, note));
    }
  }

  // ---- Claude ----

  private async importsOf(loaded: Loaded, depth: number, seen: Set<string>, steps: ChainStep[]): Promise<void> {
    const { file } = loaded;
    for (const raw of loaded.importPaths) {
      const target = raw.startsWith("~/") ? posix.join(this.o.home, raw.slice(2)) : raw.startsWith("/") ? posix.normalize(raw) : posix.join(posix.dirname(file.path), raw);
      if (depth >= MAX_IMPORT_HOPS) {
        addIssue(file, issue("import-depth", "warning", `Claude follows imports ${MAX_IMPORT_HOPS} levels deep: this one is not loaded.`, target));
        continue;
      }
      const child = await this.reader.load(target, { kind: "import", scope: file.scope, format: isTextFile(target) ? "markdown" : "private" }, "claude");
      if (!child) {
        addIssue(file, issue("broken-import", "warning", "The imported file does not exist.", target));
        continue;
      }
      if (!file.imports.includes(target)) file.imports.push(target);
      if (seen.has(target)) continue;
      seen.add(target);
      steps.push(step(child, "instructions", file.scope, true, `imported by ${file.path}`));
      await this.importsOf(child, depth + 1, seen, steps);
    }
  }

  private async instruction(path: string, kind: SetupFileKind, scope: SetupScope, seen: Set<string>, steps: ChainStep[], active = true, note?: string): Promise<boolean> {
    const loaded = await this.reader.load(path, { kind, scope, format: "markdown" }, "claude", active);
    if (!loaded) return false;
    if (seen.has(path)) return true;
    seen.add(path);
    steps.push(step(loaded, "instructions", scope, active, note));
    if (active) await this.importsOf(loaded, 0, seen, steps);
    return true;
  }

  private async rules(dir: string, scope: SetupScope, seen: Set<string>, steps: ChainStep[]): Promise<void> {
    for (const path of await this.markdownFiles(dir)) {
      const loaded = await this.reader.load(path, { kind: "rule", scope, format: "markdown" }, "claude");
      if (!loaded) continue;
      const conditional = "paths" in parseFrontmatter(loaded.text ?? "");
      await this.instruction(path, "rule", scope, seen, steps, !conditional, conditional ? "conditional: loads only for matching files" : undefined);
    }
  }

  private async claude(project: Project | null): Promise<ToolChain> {
    const { env, home, platform } = this.o;
    const C = claudeConfigDir(env, home);
    const S = claudeStateFile(env, home);
    const chain: ToolChain = { tool: "claude", steps: [], mcpServerIds: [], shadowedMcpServerIds: [], hookIds: [], pluginIds: [], issues: [] };
    const instructions: ChainStep[] = [];
    const seen = new Set<string>();
    await this.instruction(managedClaudeMd(platform), "instructions", "managed", seen, instructions);
    await this.instruction(posix.join(C, "CLAUDE.md"), "instructions", "user", seen, instructions);
    await this.rules(posix.join(C, "rules"), "user", seen, instructions);
    if (project) await this.claudeWalk(project, C, seen, instructions, chain);
    if (project) await this.rules(posix.join(project.root, ".claude", "rules"), "project", seen, instructions);

    const settings: { loaded: Loaded; scope: SetupScope }[] = [];
    const settingsSteps: ChainStep[] = [];
    const useSettings = async (path: string, scope: SetupScope): Promise<boolean> => {
      const loaded = await this.reader.load(path, { kind: "settings", scope, format: "json" }, "claude");
      if (!loaded) return false;
      settingsSteps.push(step(loaded, "settings", scope));
      settings.push({ loaded, scope });
      return true;
    };
    await useSettings(posix.join(C, "settings.json"), "user");
    if (project) {
      await useSettings(posix.join(project.root, ".claude", "settings.json"), "project");
      const local = posix.join(project.root, ".claude", "settings.local.json");
      if (!(await useSettings(local, "local")) && project.gitRoot && project.gitRoot !== project.root) await useSettings(posix.join(project.gitRoot, ".claude", "settings.local.json"), "local");
    }

    const mcpSteps: ChainStep[] = [];
    const layers: { scope: SetupScope; servers: McpServer[] }[] = [];
    const state = await this.reader.load(S, { kind: "state", scope: "user", format: "state" }, "claude");
    if (state) {
      mcpSteps.push(step(state, "mcp", "user"));
      layers.push({ scope: "user", servers: this.registerServers(state, "claude", "user", state.json === undefined ? {} : mcpServersOf(state.json), project) });
    }
    if (project) {
      for (const dir of ancestors(project.root).reverse()) {
        // The docs name no stop point for this walk upward; a parent's file is read too.
        const found = await this.reader.load(posix.join(dir, ".mcp.json"), { kind: "mcp", scope: "project", format: "json" }, "claude");
        if (!found) continue;
        mcpSteps.push(step(found, "mcp", "project"));
        layers.push({ scope: "project", servers: this.registerServers(found, "claude", "project", found.json === undefined ? {} : mcpServersOf(found.json), project) });
        break;
      }
      if (state) {
        mcpSteps.push(step(state, "mcp", "local"));
        layers.push({ scope: "local", servers: this.registerServers(state, "claude", "local", state.json === undefined ? {} : localMcpServers(state.json, project.root), project, project.root) });
      }
    }

    const skillSteps: ChainStep[] = [];
    const agentSteps: ChainStep[] = [];
    const commandSteps: ChainStep[] = [];
    const places: [string, SetupScope][] = [[C, "user"]];
    if (project) for (const dir of ancestors(project.root).filter((d) => within(d, project.gitRoot ?? project.root))) places.push([posix.join(dir, ".claude"), "project"]);
    for (const [base, scope] of places) {
      await this.catalog(posix.join(base, "skills"), "skill", scope, "claude", "skills", skillSteps);
      await this.catalog(posix.join(base, "agents"), "agent", scope, "claude", "agents", agentSteps);
      await this.catalog(posix.join(base, "commands"), "command", scope, "claude", "commands", commandSteps);
    }

    const plugins = new Map<string, PluginRow>();
    for (const { loaded, scope } of settings) {
      const parsed = loaded.json === undefined ? null : parseClaudeSettings(loaded.json);
      if (!parsed) continue;
      chain.hookIds.push(...this.registerHooks(loaded, "claude", scope, parsed.hooks));
      for (const [plugin, enabled] of Object.entries(parsed.enabledPlugins)) {
        const row: PluginRow = { id: `${loaded.file.id}#${plugin}`, plugin, enabled, scope, sourceFileId: loaded.file.id };
        this.reader.plugins.set(row.id, row);
        plugins.set(plugin, row);
      }
    }
    chain.pluginIds = [...plugins.values()].filter((row) => row.enabled).map((row) => row.id);
    chain.steps.push(...instructions, ...settingsSteps, ...mcpSteps, ...skillSteps, ...agentSteps, ...commandSteps);
    // Local beats project beats user, by name; the others are hidden.
    const winners = new Map<string, McpServer>();
    for (const layer of layers) for (const server of layer.servers) {
      const hidden = winners.get(server.name);
      if (hidden) chain.shadowedMcpServerIds.push(hidden.id);
      winners.set(server.name, server);
    }
    chain.mcpServerIds = [...winners.values()].map((server) => server.id);
    return chain;
  }

  /** From the filesystem root down to the project: CLAUDE.md files, then each AGENTS.md. */
  private async claudeWalk(project: Project, C: string, seen: Set<string>, steps: ChainStep[], chain: ToolChain): Promise<void> {
    const dirs = ancestors(project.root);
    const names: [string, SetupScope][] = [["CLAUDE.md", "project"], [".claude/CLAUDE.md", "project"], ["CLAUDE.local.md", "local"]];
    let hasClaudeMd = false;
    for (const dir of dirs) {
      for (const [name] of names) {
        const path = posix.join(dir, name);
        if (path !== posix.join(C, "CLAUDE.md") && (await this.fs.entry(path))?.kind === "file") hasClaudeMd = true;
      }
    }
    for (const dir of dirs) {
      for (const [name, scope] of names) await this.instruction(posix.join(dir, name), "instructions", scope, seen, steps);
      const path = posix.join(dir, "AGENTS.md");
      // An @AGENTS.md import already loaded it.
      const imported = seen.has(path);
      const found = await this.instruction(path, "instructions", "project", seen, steps, !hasClaudeMd, hasClaudeMd ? "Claude reads AGENTS.md only when no CLAUDE.md exists" : undefined);
      if (found && hasClaudeMd && !imported) chain.issues.push(issue("agents-md-ignored", "info", "Claude ignores this AGENTS.md because a CLAUDE.md exists. Import it with an @AGENTS.md line.", path));
    }
  }

  // ---- Codex ----

  /** The first non-empty file wins; the others are listed as skipped. */
  private async firstDoc(dir: string, names: string[], scope: SetupScope, steps: ChainStep[]): Promise<Loaded | null> {
    let winner: Loaded | null = null;
    for (const name of names) {
      const path = posix.join(dir, name);
      const empty = ((await this.fs.entry(path))?.size ?? 0) === 0;
      const loaded = await this.reader.load(path, { kind: "instructions", scope, format: "markdown" }, "codex", winner === null && !empty);
      if (!loaded) continue;
      if (winner === null && !empty) {
        winner = loaded;
        steps.push(step(loaded, "instructions", scope));
      } else {
        steps.push(step(loaded, "instructions", scope, false, winner ? `skipped: ${posix.basename(winner.file.path)} is used in this folder` : "skipped: the file is empty"));
      }
    }
    return winner;
  }

  private async codex(project: Project | null): Promise<ToolChain> {
    const { home } = this.o;
    const X = codexHome(this.o.env, home);
    const chain: ToolChain = { tool: "codex", steps: [], mcpServerIds: [], shadowedMcpServerIds: [], hookIds: [], pluginIds: [], issues: [] };
    const configSteps: { loaded: Loaded; scope: SetupScope; active: boolean }[] = [];
    const user = await this.reader.load(posix.join(X, "config.toml"), { kind: "config", scope: "user", format: "toml" }, "codex");
    const userConfig = user?.json === undefined ? null : parseCodexConfig(user.json);
    if (user) configSteps.push({ loaded: user, scope: "user", active: true });

    const instructions: ChainStep[] = [];
    await this.firstDoc(X, ["AGENTS.override.md", "AGENTS.md"], "user", instructions);
    const dirs = project ? ancestors(project.root).filter((d) => within(d, project.gitRoot ?? project.root)) : [];
    let projectBytes = 0;
    for (const dir of dirs) {
      const doc = await this.firstDoc(dir, ["AGENTS.override.md", "AGENTS.md", ...(userConfig?.fallbackNames ?? [])], "project", instructions);
      projectBytes += doc?.file.sizeBytes ?? 0;
    }
    const limit = userConfig?.maxBytes ?? CODEX_DOC_LIMIT_DEFAULT;
    if (projectBytes > limit) chain.issues.push(issue("over-codex-limit", "warning", `The project instructions total ${projectBytes} bytes; Codex reads only the first ${limit}.`));

    // Assumption: Codex trusts a project config only when ~/.codex/config.toml lists the project (or its git root) as trusted.
    const trusted = project !== null && [project.root, project.gitRoot].some((path) => path !== null && userConfig?.trust[path] === "trusted");
    const untrusted = "project not trusted by Codex";
    const hooksSteps: ChainStep[] = [];
    const hookSources: { loaded: Loaded; scope: SetupScope; raw: RawHook[] }[] = [];
    const userHooks = await this.reader.load(posix.join(X, "hooks.json"), { kind: "hooks", scope: "user", format: "json" }, "codex");
    if (userHooks) {
      hooksSteps.push(step(userHooks, "hooks", "user"));
      hookSources.push({ loaded: userHooks, scope: "user", raw: hooksOfJson(userHooks.json) });
    }
    let sawProjectFile = false;
    for (const dir of dirs) {
      const config = await this.reader.load(posix.join(dir, ".codex", "config.toml"), { kind: "config", scope: "project", format: "toml" }, "codex", trusted);
      if (config) {
        sawProjectFile = true;
        configSteps.push({ loaded: config, scope: "project", active: trusted });
      }
    }
    const hooksRoot = project?.gitRoot ?? project?.root;
    if (hooksRoot) {
      const hooks = await this.reader.load(posix.join(hooksRoot, ".codex", "hooks.json"), { kind: "hooks", scope: "project", format: "json" }, "codex", trusted);
      if (hooks) {
        sawProjectFile = true;
        hooksSteps.push(step(hooks, "hooks", "project", trusted, trusted ? undefined : untrusted));
        if (trusted) hookSources.push({ loaded: hooks, scope: "project", raw: hooksOfJson(hooks.json) });
      }
    }
    if (sawProjectFile && !trusted && project) chain.issues.push(issue("not-trusted", "info", "Codex skips this project's .codex files until the project is trusted in its config."));

    const mcpSteps: ChainStep[] = [];
    const winners = new Map<string, McpServer>();
    for (const { loaded, scope, active } of configSteps) {
      mcpSteps.push(step(loaded, "config", scope, active, active ? undefined : untrusted));
      const parsed = loaded.json === undefined ? null : parseCodexConfig(loaded.json);
      if (!parsed || !active) continue;
      hookSources.push({ loaded, scope, raw: parsed.hooks });
      for (const server of this.registerServers(loaded, "codex", scope, parsed.mcpServers, project)) {
        const hidden = winners.get(server.name);
        if (hidden) chain.shadowedMcpServerIds.push(hidden.id);
        winners.set(server.name, server);
      }
    }
    for (const { loaded, scope, raw } of hookSources) chain.hookIds.push(...this.registerHooks(loaded, "codex", scope, raw));
    chain.mcpServerIds = [...winners.values()].map((server) => server.id);

    const skillSteps: ChainStep[] = [];
    await this.catalog(agentsSkillsDir(home), "skill", "user", "codex", "skills", skillSteps);
    if (project) for (const dir of dirs.slice().reverse()) await this.catalog(posix.join(dir, ".agents", "skills"), "skill", "project", "codex", "skills", skillSteps);
    await this.catalog(posix.join(X, "skills"), "skill", "user", "codex", "skills", skillSteps, "legacy location");
    chain.steps.push(...instructions, ...mcpSteps, ...hooksSteps, ...skillSteps);
    return chain;
  }
}

const hooksOfJson = (json: JsonValue | undefined): RawHook[] => (typeof json === "object" && json !== null && !Array.isArray(json) ? parseHooks(json.hooks) : []);

const failed = (o: AgentSetupOptions): AgentSetupInventory => ({
  readAt: o.now().toISOString(),
  home: o.home,
  dirs: { claude: claudeConfigDir(o.env, o.home), claudeState: claudeStateFile(o.env, o.home), codex: codexHome(o.env, o.home) },
  files: {},
  userFileIds: [],
  projects: [],
  mcpServers: [],
  hooks: [],
  plugins: [],
  issues: [issue("unreadable", "error", "The setup could not be read.")],
  partial: false,
});

export function createAgentSetup(o: AgentSetupOptions): { get(refresh?: boolean): Promise<AgentSetupInventory> } {
  let cached: { at: number; value: AgentSetupInventory } | null = null;
  let inFlight: Promise<AgentSetupInventory> | null = null;
  const read = async (): Promise<AgentSetupInventory> => {
    const value = await new Inventory(o).build().catch(() => failed(o));
    cached = { at: o.now().getTime(), value };
    return value;
  };
  return {
    async get(refresh = false) {
      if (!refresh && cached && o.now().getTime() - cached.at < CACHE_MS) return cached.value;
      inFlight ??= read().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

export type AgentSetupReader = ReturnType<typeof createAgentSetup>;
