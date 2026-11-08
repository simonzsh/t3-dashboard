import assert from "node:assert/strict";
import { test } from "bun:test";
import type { AgentSetupInventory, McpServer } from "../../shared/agentSetup.ts";
import { MASK } from "../../src/domain/secretMask.ts";
import { createMcpStatus } from "../../src/domain/mcpStatus.ts";
import type { ClaudeListResult } from "../../src/integrations/mcp/claudeCli.ts";
import type { ProbeResult } from "../../src/integrations/mcp/probe.ts";

const server = (over: Partial<McpServer> & { name: string }): McpServer => ({
  id: `claude:user:/h/.claude.json#${over.name}`, tool: "claude", scope: "user", sourceFileId: "/h/.claude.json", transport: "stdio",
  command: "node", args: ["a.js"], url: null, env: [], headers: [], enabled: true, masked: false, projectIds: [], issues: [], ...over,
});
const http = (name: string, url: string, over: Partial<McpServer> = {}) => server({ name, transport: "http", command: null, args: [], url, ...over });

function setup(servers: McpServer[], over: { results?: Record<string, ProbeResult>; list?: ClaudeListResult | null } = {}) {
  let clock = Date.parse("2026-11-06T12:00:00Z");
  const probed: string[] = [];
  const inventoryCalls: boolean[] = [];
  const cliCalls: number[] = [];
  const list = over.list === undefined ? { ok: true, statuses: new Map(), error: null } : over.list;
  const reader = createMcpStatus({
    inventory: { get: async (refresh) => (inventoryCalls.push(refresh === true), { mcpServers: servers } as unknown as AgentSetupInventory) },
    probe: async (url) => (probed.push(url), over.results?.[url] ?? { kind: "http", status: 200 }),
    claudeList: list === null ? null : async () => (cliCalls.push(clock), list),
    now: () => new Date(clock),
  });
  return { reader, probed, inventoryCalls, cliCalls, tick: (ms: number) => void (clock += ms) };
}

test("http servers are probed and mapped: 401 needs auth, other answers are reachable, errors fail", async () => {
  const { reader } = setup([http("a", "https://a.example.com/mcp"), http("b", "https://b.example.com/mcp"), http("c", "https://c.example.com/mcp"), http("d", "https://d.example.com/mcp")], {
    results: { "https://b.example.com/mcp": { kind: "http", status: 403 }, "https://c.example.com/mcp": { kind: "http", status: 405 }, "https://d.example.com/mcp": { kind: "error", code: "TIMEOUT" } },
  });
  const rows = (await reader.get()).servers;
  assert.deepEqual(rows.map((r) => [r.name, r.status, r.detail, r.source]), [
    ["a", "reachable", "200", "http"],
    ["b", "needs-auth", "403", "http"],
    ["c", "reachable", "405", "http"],
    ["d", "failing", "TIMEOUT", "http"],
  ]);
  assert.equal(rows[0]!.checkedAt, "2026-11-06T12:00:00.000Z");
});

test("stdio and disabled servers are not probed", async () => {
  const { reader, probed } = setup([server({ name: "local" }), http("off", "https://off.example.com", { enabled: false })]);
  const rows = (await reader.get()).servers;
  assert.deepEqual(rows.map((r) => [r.name, r.status, r.source, r.checkedAt]), [["local", "configured", "config", null], ["off", "disabled", "config", null]]);
  assert.deepEqual(probed, []);
});

test("a URL that carries a credential or a variable is not probed", async () => {
  const urls = [`https://x.example.com/mcp?key=${MASK}`, "https://${HOST}/mcp", "https://user@x.example.com/mcp", `https://${MASK}@x.example.com/mcp`];
  const { reader, probed } = setup(urls.map((url, i) => http(`s${i}`, url)));
  const rows = (await reader.get()).servers;
  assert.deepEqual(probed, []);
  for (const row of rows) assert.deepEqual([row.status, row.detail], ["configured", "not checked: URL carries credentials"]);
});

test("the target is the masked URL, or the masked command with its arguments", async () => {
  const { reader } = setup([http("h", "https://h.example.com/mcp"), server({ name: "s", command: "npx", args: ["-y", "pkg"] })]);
  assert.deepEqual((await reader.get()).servers.map((r) => r.target), ["https://h.example.com/mcp", "npx -y pkg"]);
});

test("rows are ordered by scope, then tool, then name", async () => {
  const { reader } = setup([
    server({ name: "z-local", scope: "local" }),
    server({ name: "b-project", scope: "project" }),
    server({ name: "codex-user", scope: "user", tool: "codex" }),
    server({ name: "b-user", scope: "user" }),
    server({ name: "a-user", scope: "user" }),
  ]);
  assert.deepEqual((await reader.get()).servers.map((r) => r.name), ["a-user", "b-user", "codex-user", "b-project", "z-local"]);
});

test("the claude CLI never runs on a first read or a poll, and runs once on a refresh", async () => {
  const { reader, cliCalls, inventoryCalls } = setup([server({ name: "n" })], { list: { ok: true, statuses: new Map(), error: null } });
  const first = await reader.get();
  await reader.get();
  assert.deepEqual(cliCalls, []);
  assert.deepEqual(first.cli, { available: true, ranAt: null, error: null });
  const refreshed = await reader.get(true);
  assert.equal(cliCalls.length, 1);
  assert.equal(refreshed.cli.ranAt, "2026-11-06T12:00:00.000Z");
  assert.deepEqual(inventoryCalls, [false, true]);
});

test("the CLI result overrides user-scope Claude servers by name only", async () => {
  const statuses: ClaudeListResult["statuses"] = new Map([["n", { status: "failing", detail: "ENOENT" }]]);
  const { reader } = setup(
    [server({ name: "n" }), server({ name: "n", scope: "project", id: "p#n" }), server({ name: "n", tool: "codex", id: "c#n" })],
    { list: { ok: true, statuses, error: null } },
  );
  const rows = (await reader.get(true)).servers;
  assert.deepEqual(rows.map((r) => [r.scope, r.tool, r.status, r.source]), [
    ["user", "claude", "failing", "claude-cli"],
    ["user", "codex", "configured", "config"],
    ["project", "claude", "configured", "config"],
  ]);
  assert.equal(rows[0]!.detail, "ENOENT");
});

test("a refresh within 30 seconds reuses the last CLI run", async () => {
  const { reader, cliCalls, tick } = setup([server({ name: "n" })]);
  await reader.get(true);
  tick(10_000);
  await reader.get(true);
  assert.equal(cliCalls.length, 1);
  tick(25_000);
  await reader.get(true);
  assert.equal(cliCalls.length, 2);
});

test("concurrent refreshes share one CLI run", async () => {
  const { reader, cliCalls } = setup([server({ name: "n" })]);
  await Promise.all([reader.get(true), reader.get(true)]);
  assert.equal(cliCalls.length, 1);
});

test("without a claude program the refresh says the CLI is unavailable", async () => {
  const { reader } = setup([server({ name: "n" })], { list: null });
  assert.deepEqual((await reader.get(true)).cli, { available: false, ranAt: null, error: null });
});

test("a failed CLI run keeps the config rows and reports the error", async () => {
  const { reader } = setup([server({ name: "n" })], { list: { ok: false, statuses: new Map(), error: "claude mcp list did not finish" } });
  const out = await reader.get(true);
  assert.equal(out.cli.error, "claude mcp list did not finish");
  assert.equal(out.servers[0]!.status, "configured");
});

test("a read within ten minutes is cached, a refresh probes again", async () => {
  const { reader, probed, tick } = setup([http("a", "https://a.example.com")]);
  await reader.get();
  tick(300_000);
  await reader.get();
  assert.equal(probed.length, 1);
  tick(400_000);
  await reader.get();
  assert.equal(probed.length, 2);
  await reader.get(true);
  assert.equal(probed.length, 3);
});

test("at most four probes run at once, and one URL is probed once", async () => {
  let active = 0;
  let peak = 0;
  const probed: string[] = [];
  const reader = createMcpStatus({
    inventory: { get: async () => ({ mcpServers: [...Array.from({ length: 9 }, (_, i) => http(`s${i}`, `https://h${i}.example.com`)), http("dup", "https://h0.example.com")] }) as unknown as AgentSetupInventory },
    probe: async (url) => {
      probed.push(url);
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { kind: "http", status: 200 };
    },
    claudeList: null,
    now: () => new Date(),
  });
  assert.equal((await reader.get()).servers.length, 10);
  assert.equal(peak, 4);
  assert.equal(probed.length, 9);
});

test("401 on a server with configured auth is reachable; without auth it needs auth", async () => {
  const url = (n: string) => `https://${n}.example.com/mcp`;
  const h = [{ key: "Authorization", value: MASK }];
  const { reader } = setup([http("hdr", url("hdr"), { headers: h }), http("bare", url("bare")), http("env", url("env"), { headers: [{ key: "Authorization", value: "$TOKEN" }] })], {
    results: { [url("hdr")]: { kind: "http", status: 401 }, [url("bare")]: { kind: "http", status: 401 }, [url("env")]: { kind: "http", status: 403 } },
  });
  const rows = (await reader.get()).servers;
  assert.deepEqual(rows.map((r) => [r.name, r.status, r.detail]), [
    ["bare", "needs-auth", "401"],
    ["env", "reachable", "403 (auth configured, not sent)"],
    ["hdr", "reachable", "401 (auth configured, not sent)"],
  ]);
});

test("concurrent reads share one in-flight probe run", async () => {
  const { reader, probed } = setup([http("a", "https://a.example.com/mcp")]);
  const [x, y] = await Promise.all([reader.get(), reader.get()]);
  assert.equal(x, y);
  assert.deepEqual(probed, ["https://a.example.com/mcp"]);
});

test("a slow plain read that ends after a refresh does not overwrite the fresher cache", async () => {
  let release!: (r: ProbeResult) => void;
  const stale = new Promise<ProbeResult>((r) => (release = r));
  let calls = 0;
  const reader = createMcpStatus({
    inventory: { get: async () => ({ mcpServers: [http("a", "https://a.example.com/mcp")] }) as unknown as AgentSetupInventory },
    probe: async () => (++calls === 1 ? stale : { kind: "http", status: 200 }),
    claudeList: async () => ({ ok: true, statuses: new Map(), error: null }) as ClaudeListResult,
    now: () => new Date("2026-11-06T12:00:00Z"),
  });
  const slow = reader.get(false);
  const refreshed = await reader.get(true);
  assert.equal(refreshed.servers[0]!.status, "reachable");
  release({ kind: "error", code: "TIMEOUT" });
  await slow;
  assert.equal((await reader.get(false)).servers[0]!.status, "reachable");
});
