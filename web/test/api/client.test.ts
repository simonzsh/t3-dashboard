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
  await api.sendQueued("t 1", "q/1");
  await api.editQueued("t 1", "q/1", "new");
  await api.cancelQueued("t 1", "q/1");
  assert.deepEqual(calls.map((c) => c.url), [
    "/api/threads/t%201/messages",
    "/api/threads/t%201/interrupt",
    "/api/threads/t%201/subagents/s%2F1/stop",
    "/api/threads/t%201/settings",
    "/api/threads/t%201/requests/r%2F1/respond",
    "/api/threads/t%201/requests/r%2F1/dismiss",
    "/api/threads/t%201/settle",
    "/api/threads/t%201/unsettle",
    "/api/threads/t%201/queue/q%2F1/send",
    "/api/threads/t%201/queue/q%2F1/edit",
    "/api/threads/t%201/queue/q%2F1/cancel",
  ]);
  for (const c of calls) {
    assert.equal(c.init?.method, "POST");
    assert.equal(new Headers(c.init?.headers).get("content-type"), "application/json");
  }
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { text: "yo", mode: "steer" });
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {});
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { runtimeMode: "auto" });
  assert.deepEqual(JSON.parse(String(calls[4]?.init?.body)), { decision: "accept" });
  assert.deepEqual(JSON.parse(String(calls[9]?.init?.body)), { text: "new" });
});

test("stash calls use GET to list, and POST to create and delete", async () => {
  const { calls, api } = fake(200, { entries: [] });
  await api.getStash();
  await api.createStash({ text: "hi", uploads: [], threadId: "t 1", threadTitle: "T" });
  await api.deleteStash("s/1");
  assert.deepEqual(calls.map((c) => [c.url, c.init?.method ?? "GET"]), [["/api/stash", "GET"], ["/api/stash", "POST"], ["/api/stash/s%2F1/delete", "POST"]]);
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { text: "hi", uploads: [], threadId: "t 1", threadTitle: "T" });
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
  const { calls, api } = fake(200, { configured: true, ok: true, error: null, issues: [], readAt: "2026-11-06T12:00:00.000Z", inbox: [], inboxError: null });
  await api.getBoard();
  await api.getBoard(true);
  assert.deepEqual(calls.map((c) => c.url), ["/api/board", "/api/board?refresh=1"]);
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("getLimits asks for a fresh read on demand", async () => {
  const { calls, api } = fake(200, {});
  await api.getLimits();
  await api.getLimits(true);
  assert.deepEqual(calls.map((c) => c.url), ["/api/limits", "/api/limits?refresh=1"]);
});

test("getUsage sends the encoded time zone and the period, and forces a refresh on demand", async () => {
  const { calls, api } = fake(200, {});
  await api.getUsage("America/Port-au-Prince", 7);
  await api.getUsage("Europe/Paris", 90, true);
  assert.deepEqual(calls.map((c) => c.url), ["/api/usage?tz=America%2FPort-au-Prince&period=7", "/api/usage?tz=Europe%2FParis&period=90&refresh=1"]);
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
  const result = { automations: [], automationThreadIds: [], setupThreadIds: [] };
  const { calls, api } = fake(200, result);
  assert.deepEqual(await api.getAutomations(), result);
  assert.equal(calls[0]?.url, "/api/automations");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("createAutomation posts the body as JSON and returns the created task", async () => {
  const result = { ok: true, id: "task-3", webhookUrl: null, nextRunAt: "2026-11-05T09:00:00.000Z" };
  const { calls, api } = fake(200, result);
  const body = { kind: "routine" as const, title: "", prompt: "Triage", projectId: "", modelSelection: { instanceId: "provider-a", model: "model-x" }, schedule: { type: "interval" as const, everyMinutes: 15 } };
  assert.deepEqual(await api.createAutomation(body), result);
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

test("setAutomationEnabled posts the flag to the enabled route of the task", async () => {
  const { calls, api } = fake(200, { ok: true });
  await api.setAutomationEnabled("task/1", false);
  assert.equal(calls[0]?.url, "/api/automations/task%2F1/enabled");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { enabled: false });
});

test("runAutomation posts to the run route of the task", async () => {
  const { calls, api } = fake(200, { ok: true });
  await api.runAutomation("task/1");
  assert.equal(calls[0]?.url, "/api/automations/task%2F1/run");
  assert.equal(calls[0]?.init?.method, "POST");
});

test("updateAutomation posts the body to the update route of the task", async () => {
  const { calls, api } = fake(200, { ok: true });
  const body = { kind: "reminder" as const, title: "", prompt: "p", projectId: "", modelSelection: { instanceId: "i", model: "m" }, at: "2026-11-05T10:00:00.000Z" };
  await api.updateAutomation("task/1", body);
  assert.equal(calls[0]?.url, "/api/automations/task%2F1/update");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), body);
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

test("getServerStats reads /api/server-stats", async () => {
  const { calls, api } = fake(200, {});
  await api.getServerStats();
  assert.deepEqual(calls.map((c) => c.url), ["/api/server-stats"]);
});

test("getCacheCleanup reads the sizes and clearCaches posts an empty JSON body", async () => {
  const { calls, api } = fake(200, {});
  await api.getCacheCleanup();
  await api.clearCaches();
  assert.deepEqual(calls.map((c) => c.url), ["/api/cache-cleanup", "/api/cache-cleanup"]);
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.body, "{}");
  assert.deepEqual(calls[1]?.init?.headers, { "content-type": "application/json" });
});

test("browseFolders encodes the typed path in the query", async () => {
  const { calls, api } = fake(200, { path: "/home/x/a b", kind: "missing", entries: [] });
  const res = await api.browseFolders("~/a b/&c/");
  assert.equal(res.kind, "missing");
  assert.equal(calls[0]?.url, "/api/folders?path=~%2Fa%20b%2F%26c%2F");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("createProject posts the body and returns the result", async () => {
  const { calls, api } = fake(200, { ok: true, projectId: "p9", created: true });
  const res = await api.createProject({ path: "~/src/new", title: "New" });
  assert.deepEqual(res, { ok: true, projectId: "p9", created: true });
  assert.equal(calls[0]?.url, "/api/projects");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { path: "~/src/new", title: "New" });
});

test("updateProject posts the changed fields to the project's update route", async () => {
  const { calls, api } = fake(200, { ok: true });
  await api.updateProject("p 1", { title: "New", icon: null });
  assert.equal(calls[0]?.url, "/api/projects/p%201/update");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { title: "New", icon: null });
});

test("deleteProject posts an empty body; projectIcons is a GET", async () => {
  const { calls, api } = fake(200, { ok: true });
  await api.deleteProject("p1");
  assert.equal(calls[0]?.url, "/api/projects/p1/delete");
  assert.equal(calls[0]?.init?.method, "POST");
  await api.projectIcons();
  assert.equal(calls[1]?.url, "/api/project-icons");
  assert.equal(calls[1]?.init?.method ?? "GET", "GET");
});

test("the news calls hit the news routes", async () => {
  const { calls, api } = fake(200, {});
  await api.getNews();
  await api.getNewsArticle("2026-11-07");
  const body = { enabled: true, frequency: "daily" as const, weekday: 1, timeOfDay: "07:00", language: "French" as const, modelSelection: { instanceId: "provider-a", model: "model-x" } };
  await api.searchNews("café & co");
  await api.saveNews(body);
  await api.runNews();
  await api.deleteNewsArticle("2026-11-07");
  await api.deleteAllNews();
  assert.deepEqual(calls.map((c) => [c.url, c.init?.method ?? "GET"]), [["/api/news", "GET"], ["/api/news/2026-11-07", "GET"], ["/api/news/search?q=caf%C3%A9%20%26%20co", "GET"], ["/api/news/settings", "POST"], ["/api/news/run", "POST"], ["/api/news/2026-11-07/delete", "POST"], ["/api/news/delete-all", "POST"]]);
  assert.deepEqual(JSON.parse(calls[3]!.init!.body as string), body);
});
