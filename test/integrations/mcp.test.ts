import assert from "node:assert/strict";
import { test } from "bun:test";
import { claudeMcpList, findClaude, parseClaudeMcpList } from "../../src/integrations/mcp/claudeCli.ts";
import { probeMcpHttp, type ProbeFetch } from "../../src/integrations/mcp/probe.ts";

test("the probe sends one plain GET and reports the HTTP status", async () => {
  const calls: Parameters<ProbeFetch>[] = [];
  const fetch: ProbeFetch = async (...args) => (calls.push(args), { status: 401 });
  assert.deepEqual(await probeMcpHttp("https://mcp.example.com/mcp", { fetch }), { kind: "http", status: 401 });
  const [url, init] = calls[0]!;
  assert.equal(url, "https://mcp.example.com/mcp");
  assert.deepEqual(Object.keys(init.headers), ["accept"]);
  assert.equal(init.redirect, "manual");
  assert.equal(init.credentials, "omit");
  assert.equal(init.method, "GET");
});

test("a redirect answer is a status, not followed", async () => {
  assert.deepEqual(await probeMcpHttp("https://x.example.com", { fetch: async () => ({ status: 302 }) }), { kind: "http", status: 302 });
});

test("the probe cancels the answer body", async () => {
  let cancelled = false;
  await probeMcpHttp("https://x.example.com", { fetch: async () => ({ status: 200, body: { cancel: () => void (cancelled = true) } }) });
  assert.equal(cancelled, true);
});

test("a call that does not answer in time is a TIMEOUT error", async () => {
  const fetch: ProbeFetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  assert.deepEqual(await probeMcpHttp("https://slow.example.com", { fetch, timeoutMs: 20 }), { kind: "error", code: "TIMEOUT" });
});

test("a network error keeps only a code, never the message", async () => {
  const refused = Object.assign(new Error("connect failed to https://x.example.com?token=abc"), { code: "ECONNREFUSED" });
  assert.deepEqual(await probeMcpHttp("https://x.example.com", { fetch: async () => Promise.reject(refused) }), { kind: "error", code: "ECONNREFUSED" });
  assert.deepEqual(await probeMcpHttp("https://x.example.com", { fetch: async () => Promise.reject(new Error("boom")) }), { kind: "error", code: "ERROR" });
});

const LIST = [
  "Checking MCP server health…",
  "",
  "docs: https://mcp.example.com/mcp (HTTP) - ✔ Connected",
  "notes: npx -y notes-server - ! Needs authentication",
  "broken: node /srv/a.js - ✘ Failed to connect — ECONNREFUSED: secret-token-in-server-text",
  "odd: node b.js - ✘ Something unexpected sk-abcdefghijklmnopqrstuvwxyz1234",
  "pending: node c.js - ⏸ Pending approval (run `claude` to approve)",
  "off: node d.js - ⊘ Disabled for this project (re-enable via /mcp)",
  "claude.ai Gmail: https://gmail.mcp.example.com - ✔ Connected",
].join("\n");

test("claude mcp list lines map to a status and a safe detail", () => {
  assert.deepEqual([...parseClaudeMcpList(LIST)], [
    ["docs", { status: "reachable", detail: null }],
    ["notes", { status: "needs-auth", detail: null }],
    ["broken", { status: "failing", detail: "ECONNREFUSED" }],
    ["odd", { status: "failing", detail: "failed" }],
    ["pending", { status: "configured", detail: "Pending approval" }],
    ["off", { status: "configured", detail: "Disabled for this project" }],
  ]);
});

test("claudeMcpList runs once with a timeout and reports a failed run", async () => {
  const calls: unknown[][] = [];
  const ok = await claudeMcpList(async (...args) => (calls.push(args), { code: 0, stdout: LIST }), "/bin/claude");
  assert.equal(ok.ok, true);
  assert.equal(ok.statuses.size, 6);
  assert.deepEqual(calls, [["/bin/claude", ["mcp", "list"], { timeoutMs: 30_000 }]]);
  const late = await claudeMcpList(async () => ({ code: null, stdout: "" }), "/bin/claude");
  assert.deepEqual([late.ok, late.statuses.size, late.error], [false, 0, "claude mcp list did not finish"]);
  assert.equal((await claudeMcpList(async () => ({ code: 2, stdout: "" }), "/bin/claude")).error, "claude mcp list exited with code 2");
});

test("findClaude prefers PATH, then the usual folders", () => {
  const exists = (known: string[]) => (path: string) => known.includes(path);
  assert.equal(findClaude("/h", exists([]), () => "/p/claude"), "/p/claude");
  assert.equal(findClaude("/h", exists(["/h/.claude/local/claude", "/h/.local/bin/claude"]), () => null), "/h/.local/bin/claude");
  assert.equal(findClaude("/h", exists(["/h/.claude/local/claude"]), () => null), "/h/.claude/local/claude");
  assert.equal(findClaude("/h", exists([]), () => null), null);
});
