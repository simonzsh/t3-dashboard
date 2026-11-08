import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardProject, McpOverview, McpServerStatus } from "../../../../shared/api.ts";
import { McpCard } from "../../../src/features/dashboard/McpCard.tsx";
import type { ReadState } from "../../../src/features/dashboard/pollRead.ts";

const row = (over: Partial<McpServerStatus> & { name: string }): McpServerStatus => ({
  serverId: `id-${over.name}`, tool: "claude", scope: "user", transport: "http", target: "https://mcp.example.com/mcp", projectIds: [], status: "reachable", detail: "200", source: "http", checkedAt: null, ...over,
});
const overview = (servers: McpServerStatus[]): McpOverview => ({ servers, readAt: "2026-11-06T12:00:00.000Z", cli: { available: false, ranAt: null, error: null } });
const state = (over: Partial<ReadState<McpOverview>> = {}): ReadState<McpOverview> => ({ value: overview([]), error: null, loading: false, refresh: () => {}, ...over });
const NOW = new Date("2026-11-06T12:03:00.000Z");
const projects = [{ id: "p1", title: "Atlas Web", icon: null }] as DashboardProject[];
const render = (over: Partial<ReadState<McpOverview>> = {}) => renderToStaticMarkup(<McpCard state={state(over)} now={NOW} projects={projects} />);

test("the card is titled MCP servers and counts the servers", () => {
  const out = render({ value: overview([row({ name: "a" }), row({ name: "b" })]) });
  assert.match(out, /<h2 id="dashboard-mcp-head">MCP servers<\/h2>/);
  assert.match(out, />2 servers</);
  assert.match(out, /Updated 3 min ago/);
  assert.match(render({ value: overview([row({ name: "a" })]) }), />1 server</);
});

test("servers are grouped by scope in the order User, Project, Local, and empty groups are left out", () => {
  const out = render({ value: overview([row({ name: "l", scope: "local" }), row({ name: "u" }), row({ name: "p", scope: "project", projectIds: ["p1"] })]) });
  const heads = [...out.matchAll(/class="mcp-group-head">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(heads, ["User", "Project", "Local"]);
  assert.doesNotMatch(render({ value: overview([row({ name: "u" })]) }), /Project<|Local<|Managed</);
});

test("a project row shows its project tag, and a user row does not", () => {
  const out = render({ value: overview([row({ name: "p", scope: "project", projectIds: ["p1"] }), row({ name: "u", projectIds: ["p1"] })]) });
  assert.equal(out.match(/class="project-tag"/g)?.length, 1);
});

test("each status has its own badge, and the detail is a tooltip", () => {
  const out = render({
    value: overview([
      row({ name: "a", status: "reachable" }),
      row({ name: "b", status: "needs-auth", detail: "401" }),
      row({ name: "c", status: "failing", detail: "ECONNREFUSED" }),
      row({ name: "d", status: "configured", detail: null }),
      row({ name: "e", status: "disabled", detail: null }),
    ]),
  });
  assert.match(out, /class="badge done">Reachable</);
  assert.match(out, /class="badge waiting">[^]*Needs auth</);
  assert.match(out, /class="badge error">[^]*Failing</);
  assert.equal(out.match(/class="badge neutral">/g)?.length, 2);
  assert.match(out, /data-tooltip="ECONNREFUSED"/);
});

test("a row shows the masked target and the tool icon", () => {
  const out = render({ value: overview([row({ name: "a", tool: "codex", target: "https://x.example.com/mcp?key=••••••" })]) });
  assert.match(out, /class="mcp-target"[^>]*>https:\/\/x\.example\.com\/mcp\?key=••••••</);
  assert.match(out, /aria-label="Codex"/);
});

test("the card shows a skeleton while loading, an empty note, and links to Setup", () => {
  assert.match(render({ value: null, loading: true }), /aria-label="Loading MCP servers"/);
  const empty = render();
  assert.match(empty, /No MCP servers are configured\./);
  assert.match(empty, /href="#\/setup"[^>]*>Open Setup</);
});

test("an error shows alone without a value, and as a note over the last value", () => {
  assert.match(render({ value: null, error: "Cannot reach the dashboard server." }), /role="alert">Cannot reach the dashboard server\./);
  const kept = render({ value: overview([row({ name: "a" })]), error: "boom" });
  assert.match(kept, /Could not refresh MCP servers\. boom/);
  assert.match(kept, /class="mcp-name">a</);
});

test("the refresh button is busy while loading", () => {
  assert.match(render(), /aria-busy="false"/);
  assert.match(render({ loading: true }), /aria-busy="true"/);
});
