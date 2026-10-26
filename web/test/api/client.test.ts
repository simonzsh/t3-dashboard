import { test } from "bun:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/api/client.ts";

interface Call { url: string; init: RequestInit | undefined }

function fake(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { calls, api: createApi(fetch) };
}

test("getThread uses GET and encodes ids", async () => {
  const { calls, api } = fake(200, {});
  await api.getThread("a/b c");
  assert.equal(calls[0]?.url, "/api/threads/a%2Fb%20c");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("createThread posts JSON with content-type", async () => {
  const { calls, api } = fake(200, { ok: true, threadId: "thread-9" });
  const body = { projectId: "p", title: "t", text: "hi", modelSelection: { instanceId: "provider-a", model: "model-x" } };
  const res = await api.createThread(body);
  assert.equal(res.threadId, "thread-9");
  assert.equal(calls[0]?.url, "/api/threads");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(new Headers(calls[0]?.init?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), body);
});

test("action routes hit the right URL with a JSON body", async () => {
  const { calls, api } = fake(200, { ok: true });
  await api.sendMessage("t 1", { text: "yo", mode: "steer" });
  await api.interrupt("t 1");
  await api.updateSettings("t 1", { runtimeMode: "auto" });
  await api.respond("t 1", "r/1", { decision: "accept" });
  await api.dismiss("t 1", "r/1");
  await api.settle("t 1");
  await api.unsettle("t 1");
  assert.deepEqual(calls.map((c) => c.url), [
    "/api/threads/t%201/messages",
    "/api/threads/t%201/interrupt",
    "/api/threads/t%201/settings",
    "/api/threads/t%201/requests/r%2F1/respond",
    "/api/threads/t%201/requests/r%2F1/dismiss",
    "/api/threads/t%201/settle",
    "/api/threads/t%201/unsettle",
  ]);
  for (const c of calls) {
    assert.equal(c.init?.method, "POST");
    assert.equal(new Headers(c.init?.headers).get("content-type"), "application/json");
  }
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { text: "yo", mode: "steer" });
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {});
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { runtimeMode: "auto" });
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { decision: "accept" });
});

test("non-2xx throws with the server message", async () => {
  const { api } = fake(502, { error: "T3 refused" });
  await assert.rejects(() => api.interrupt("t"), { message: "T3 refused" });
});

test("non-2xx without JSON error body still throws", async () => {
  const fetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof globalThis.fetch;
  await assert.rejects(() => createApi(fetch).getHealth(), /500/);
});

test("getBoard reads the cache by default and forces a refresh on demand", async () => {
  const { calls, api } = fake(200, { configured: true, ok: true, error: null, issues: [] });
  await api.getBoard();
  await api.getBoard(true);
  assert.deepEqual(calls.map((c) => c.url), ["/api/board", "/api/board?refresh=1"]);
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("assignIssue posts the body to the assign route", async () => {
  const { calls, api } = fake(200, { ok: true, threadId: "thread-7" });
  const body = { issueId: "i1", projectId: "p1", text: "", modelSelection: { instanceId: "codex", model: "m" } };
  const res = await api.assignIssue(body);
  assert.equal(res.threadId, "thread-7");
  assert.equal(calls[0]?.url, "/api/board/assign");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), body);
});

test("getAutomations reads /api/automations with GET", async () => {
  const result = { automations: [], brains: [] };
  const { calls, api } = fake(200, result);
  assert.deepEqual(await api.getAutomations(), result);
  assert.equal(calls[0]?.url, "/api/automations");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("settings and setup calls use the right routes and verbs", async () => {
  const { calls, api } = fake(200, {});
  await api.getSettings();
  await api.retrySetup();
  await api.pasteToken("tok");
  await api.connectLinear("key");
  await api.disconnectLinear();
  assert.deepEqual(
    calls.map((call) => [call.url, call.init?.method ?? "GET", call.init?.body ?? null]),
    [
      ["/api/settings", "GET", null],
      ["/api/setup/retry", "POST", "{}"],
      ["/api/setup/token", "POST", '{"token":"tok"}'],
      ["/api/settings/linear/key", "POST", '{"apiKey":"key"}'],
      ["/api/settings/linear/disconnect", "POST", "{}"],
    ],
  );
});

test("a server error message reaches the caller", async () => {
  const { api } = fake(400, { error: "Linear refused this key." });
  await assert.rejects(api.connectLinear("bad"), /Linear refused this key\./);
});

test("update calls use GET for the status and POST for check and apply", async () => {
  const { calls, api } = fake(200, {});
  await api.getUpdate();
  await api.checkUpdate();
  await api.applyUpdate();
  assert.deepEqual(calls.map((c) => [c.url, c.init?.method ?? "GET"]), [["/api/update", "GET"], ["/api/update/check", "POST"], ["/api/update/apply", "POST"]]);
});
