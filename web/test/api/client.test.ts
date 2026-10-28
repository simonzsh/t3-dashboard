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
  await api.stopSubagent("t 1", "s/1");
  await api.updateSettings("t 1", { runtimeMode: "auto" });
  await api.respond("t 1", "r/1", { decision: "accept" });
  await api.dismiss("t 1", "r/1");
  await api.settle("t 1");
  await api.unsettle("t 1");
  assert.deepEqual(calls.map((c) => c.url), [
    "/api/threads/t%201/messages",
    "/api/threads/t%201/interrupt",
    "/api/threads/t%201/subagents/s%2F1/stop",
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
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { runtimeMode: "auto" });
  assert.deepEqual(JSON.parse(String(calls[4]?.init?.body)), { decision: "accept" });
});

test("non-2xx throws with the server message", async () => {
  const { api } = fake(502, { error: "T3 refused" });
  await assert.rejects(() => api.interrupt("t"), { message: "T3 refused" });
});

test("non-2xx without JSON error body still throws", async () => {
  const fetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof globalThis.fetch;
  await assert.rejects(() => createApi(fetch).getHealth(), /server hit an error/);
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
  const result = { automations: [], hiddenThreadIds: [] };
  const { calls, api } = fake(200, result);
  assert.deepEqual(await api.getAutomations(), result);
  assert.equal(calls[0]?.url, "/api/automations");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("requestAutomation posts the request as JSON", async () => {
  const { calls, api } = fake(200, { ok: true, threadId: "thread-3" });
  const body = { text: "Remind me", projectId: "", modelSelection: { instanceId: "provider-a", model: "model-x" } };
  assert.equal((await api.requestAutomation(body)).threadId, "thread-3");
  assert.equal(calls[0]?.url, "/api/automations");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), body);
});

test("deleteAutomation posts to the delete route of the task", async () => {
  const { calls, api } = fake(200, { ok: true });
  await api.deleteAutomation("task/1");
  assert.equal(calls[0]?.url, "/api/automations/task%2F1/delete");
  assert.equal(calls[0]?.init?.method, "POST");
});

test("renameAutomation posts the title to the rename route of the task", async () => {
  const { calls, api } = fake(200, { ok: true });
  await api.renameAutomation("task/1", "New name");
  assert.equal(calls[0]?.url, "/api/automations/task%2F1/rename");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { title: "New name" });
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

test("searchThreads encodes the query and sends the limit only when given", async () => {
  const { calls, api } = fake(200, { matches: [] });
  await api.searchThreads("a&b #c d");
  await api.searchThreads("x", 20);
  assert.equal(calls[0]?.url, "/api/search?q=a%26b%20%23c%20d");
  assert.equal(calls[1]?.url, "/api/search?q=x&limit=20");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

function scripted(responses: Response[]) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return responses.shift()!;
  }) as typeof globalThis.fetch;
  return { calls, api: createApi(fetch) };
}

const ok = (body: unknown, etag?: string) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...(etag && { etag }) } });
const sentEtag = (call?: Call) => new Headers(call?.init?.headers).get("if-none-match");

test("getThread sends no condition first, then the etag, and a 304 returns the same object", async () => {
  const { calls, api } = scripted([ok({ n: 1 }, 'W/"abc"'), new Response(null, { status: 304 })]);
  const first = await api.getThread("t1");
  const second = await api.getThread("t1");
  assert.equal(sentEtag(calls[0]), null);
  assert.equal(sentEtag(calls[1]), 'W/"abc"');
  assert.equal(second, first);
});

test("getThread keeps nothing from a 200 without etag", async () => {
  const { calls, api } = scripted([ok({ n: 1 }), ok({ n: 2 })]);
  await api.getThread("t1");
  assert.deepEqual(await api.getThread("t1"), { n: 2 });
  assert.equal(sentEtag(calls[1]), null);
});

test("getThread retries once without the header on an unexpected 304", async () => {
  const { calls, api } = scripted([new Response(null, { status: 304 }), ok({ n: 3 }, 'W/"x"')]);
  assert.deepEqual(await api.getThread("t1"), { n: 3 });
  assert.equal(calls.length, 2);
  assert.equal(sentEtag(calls[1]), null);
});

test("getThread still throws the server message", async () => {
  const { api } = scripted([new Response(JSON.stringify({ error: "gone" }), { status: 404 })]);
  await assert.rejects(api.getThread("t1"), /gone/);
});

test("getThread keeps etags per thread and forgets the oldest past 50", async () => {
  const responses = Array.from({ length: 51 }, (_, i) => ok({ i }, `W/"${i}"`));
  const { calls, api } = scripted([...responses, ok({}, 'W/"again"'), ok({}, 'W/"again"')]);
  for (let i = 0; i < 51; i++) await api.getThread(`t${i}`);
  await api.getThread("t0");
  await api.getThread("t50");
  assert.equal(sentEtag(calls[51]), null, "oldest entry was evicted");
  assert.equal(sentEtag(calls[52]), 'W/"50"');
});
