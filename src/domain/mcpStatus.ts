import type { McpOverview, McpServer, McpServerStatus, SetupScope } from "../../shared/agentSetup.ts";
import type { ClaudeListResult } from "../integrations/mcp/claudeCli.ts";
import type { ProbeResult } from "../integrations/mcp/probe.ts";
import type { AgentSetupReader } from "./agentSetup.ts";
import { MASK } from "./secretMask.ts";

export const CACHE_MS = 600_000;
const CLI_MIN_GAP_MS = 30_000;
const MAX_PROBES = 4;
const MAX_TARGET_CHARS = 200;
const SCOPE_ORDER: SetupScope[] = ["user", "project", "local", "managed"];
const NOT_CHECKED = "not checked: URL carries credentials";

export interface McpStatusOptions {
  inventory: Pick<AgentSetupReader, "get">;
  probe: (url: string) => Promise<ProbeResult>;
  /** Null when no claude program exists. */
  claudeList: (() => Promise<ClaudeListResult>) | null;
  now: () => Date;
}

type Verdict = Pick<McpServerStatus, "status" | "detail" | "source" | "checkedAt">;

// Servers hold masked values only: a mask, a ${VAR} or userinfo means the real URL carries a credential.
const carriesCredential = (url: string): boolean => url.includes(MASK) || url.includes("${") || /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(url);
const hasAuth = (s: McpServer): boolean => s.headers.length > 0;
const targetOf = (s: McpServer): string => (s.url ?? [s.command, ...s.args].filter((part) => part !== null).join(" ")).slice(0, MAX_TARGET_CHARS);

/** Runs `task` on each item with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  }));
}

export function createMcpStatus(o: McpStatusOptions): { get(refresh?: boolean): Promise<McpOverview> } {
  let cached: { at: number; overview: McpOverview } | null = null;
  const inFlight = new Map<boolean, Promise<McpOverview>>();
  // A compute may write the cache only if it started after the one that wrote it last.
  let started = 0;
  let written = 0;
  // The last CLI run; later reads keep its answer until the next refresh.
  let cli: { startedAt: number; ranAt: string | null; result: ClaudeListResult | null; promise: Promise<void> } | null = null;

  // One run at a time, and not again within 30 seconds: `claude mcp list` starts every server.
  function runCli(): Promise<void> {
    if (!o.claudeList) return Promise.resolve();
    const startedAt = o.now().getTime();
    if (!cli || startedAt - cli.startedAt >= CLI_MIN_GAP_MS) {
      const run = { startedAt, ranAt: null as string | null, result: null as ClaudeListResult | null, promise: Promise.resolve() };
      run.promise = o.claudeList().then((result) => {
        run.result = result;
        run.ranAt = o.now().toISOString();
      });
      cli = run;
    }
    return cli.promise;
  }

  async function compute(refresh: boolean): Promise<McpOverview> {
    const inventory = await o.inventory.get(refresh);
    if (refresh) await runCli();
    const servers = inventory.mcpServers;
    const checkedAt = o.now().toISOString();
    const isRemote = (s: McpServer) => (s.transport === "http" || s.transport === "sse") && s.url !== null;
    const probes = new Map<string, ProbeResult>();
    const toProbe = [...new Set(servers.filter((s) => s.enabled && isRemote(s) && !carriesCredential(s.url!)).map((s) => s.url!))];
    await pool(toProbe, MAX_PROBES, async (url) => void probes.set(url, await o.probe(url)));

    const cliStatuses = cli?.result?.ok ? cli.result.statuses : null;
    const verdict = (s: McpServer): Verdict => {
      const config: Verdict = { status: "configured", detail: null, source: "config", checkedAt: null };
      if (!s.enabled) return { ...config, status: "disabled" };
      const fromCli = s.tool === "claude" && s.scope === "user" ? cliStatuses?.get(s.name) : undefined;
      if (fromCli) return { ...fromCli, source: "claude-cli", checkedAt: cli?.ranAt ?? null };
      const result = s.url === null ? undefined : probes.get(s.url);
      if (result) {
        if (result.kind === "error") return { status: "failing", detail: result.code, source: "http", checkedAt };
        const denied = result.status === 401 || result.status === 403;
        // The probe sends no credential: with auth configured, a 401 still proves the server answered.
        if (denied && hasAuth(s)) return { status: "reachable", detail: `${result.status} (auth configured, not sent)`, source: "http", checkedAt };
        return { status: denied ? "needs-auth" : "reachable", detail: String(result.status), source: "http", checkedAt };
      }
      return isRemote(s) ? { ...config, detail: NOT_CHECKED } : config;
    };

    const rows = servers.map((s): McpServerStatus => ({ serverId: s.id, name: s.name, tool: s.tool, scope: s.scope, transport: s.transport, target: targetOf(s), projectIds: s.projectIds, ...verdict(s) }));
    rows.sort((a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) || a.tool.localeCompare(b.tool) || a.name.localeCompare(b.name));
    return { servers: rows, readAt: checkedAt, cli: { available: o.claudeList !== null, ranAt: cli?.ranAt ?? null, error: cli?.result && !cli.result.ok ? cli.result.error : null } };
  }

  return {
    get(refresh = false) {
      if (!refresh && cached && o.now().getTime() - cached.at < CACHE_MS) return Promise.resolve(cached.overview);
      const running = inFlight.get(refresh);
      if (running) return running;
      const seq = ++started;
      const run = compute(refresh).then((overview) => {
        if (seq > written) {
          written = seq;
          cached = { at: o.now().getTime(), overview };
        }
        return overview;
      }).finally(() => inFlight.delete(refresh));
      inFlight.set(refresh, run);
      return run;
    },
  };
}

export type McpStatusReader = ReturnType<typeof createMcpStatus>;
