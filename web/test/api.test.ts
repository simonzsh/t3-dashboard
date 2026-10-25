import { test } from "bun:test";
import assert from "node:assert/strict";
import { createApi } from "../src/api.ts";

interface Call { url: string; init: RequestInit | undefined }

function fake(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { calls, api: createApi(fetch) };
}

test("getState and getThread use GET and encode ids", async () => {
  const { calls, api } = fake(200, {});
  await api.getState();
  await api.getThread("a/b c");
  assert.equal(calls[0]?.url, "/api/state");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
  assert.equal(calls[1]?.url, "/api/threads/a%2Fb%20c");
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
  await api.archive("t 1");
  await api.pin("t 1");
  await api.unpin("t 1");
  await api.respond("t 1", "r/1", { decision: "accept" });
  await api.dismiss("t 1", "r/1");
  assert.deepEqual(calls.map((c) => c.url), [
    "/api/threads/t%201/messages",
    "/api/threads/t%201/interrupt",
    "/api/threads/t%201/archive",
    "/api/threads/t%201/pin",
    "/api/threads/t%201/unpin",
    "/api/threads/t%201/requests/r%2F1/respond",
    "/api/threads/t%201/requests/r%2F1/dismiss",
  ]);
  for (const c of calls) {
    assert.equal(c.init?.method, "POST");
    assert.equal(new Headers(c.init?.headers).get("content-type"), "application/json");
  }
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { text: "yo", mode: "steer" });
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {});
  assert.deepEqual(JSON.parse(String(calls[5]?.init?.body)), { decision: "accept" });
});

test("non-2xx throws with the server message", async () => {
  const { api } = fake(502, { error: "T3 refused" });
  await assert.rejects(() => api.archive("t"), { message: "T3 refused" });
});

test("non-2xx without JSON error body still throws", async () => {
  const fetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof globalThis.fetch;
  await assert.rejects(() => createApi(fetch).getState(), /500/);
});

test("getBoard reads the cache by default and forces a refresh on demand", async () => {
  const { calls, api } = fake(200, { workspaces: [], issues: [], fetchedAt: "" });
  await api.getBoard();
  await api.getBoard(true);
  assert.deepEqual(calls.map((c) => c.url), ["/api/board", "/api/board?refresh=1"]);
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});

test("assignIssue posts the body to the assign route", async () => {
  const { calls, api } = fake(200, { ok: true, threadId: "thread-7" });
  const body = { workspace: "ws-1", issueId: "i1", agent: "codex" as const };
  const res = await api.assignIssue(body);
  assert.equal(res.threadId, "thread-7");
  assert.equal(calls[0]?.url, "/api/board/assign");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), body);
});

test("getAutomations reads /api/automations with GET", async () => {
  const result = { automations: [], brains: [], fetchedAt: "2026-01-10T10:00:00.000Z" };
  const { calls, api } = fake(200, result);
  assert.deepEqual(await api.getAutomations(), result);
  assert.equal(calls[0]?.url, "/api/automations");
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
});
