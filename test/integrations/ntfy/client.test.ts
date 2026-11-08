import assert from "node:assert/strict";
import { test } from "bun:test";
import { IntegrationError } from "../../../src/integrations/errors.ts";
import { NtfyClient, newTopic } from "../../../src/integrations/ntfy/client.ts";

const cfg = { server: "https://ntfy.example", topic: "secret-topic" };
const message = { title: "Fix the bug", message: "Finished", priority: 3, click: "https://dash.example/#/sessions/t1" };

function fake(reply: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new NtfyClient(async (url, init) => {
    calls.push({ url, init });
    return reply();
  });
  return { client, calls };
}
const ok = () => new Response(JSON.stringify({ id: "x1", event: "message", time: 1 }), { status: 200 });

test("publish posts one JSON message to the server root", async () => {
  const { client, calls } = fake(ok);
  await client.publish(cfg, message);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://ntfy.example");
  assert.equal(calls[0]!.init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { topic: "secret-topic", title: "Fix the bug", message: "Finished", priority: 3, click: "https://dash.example/#/sessions/t1" });
});

test("publish leaves out an absent click", async () => {
  const { client, calls } = fake(ok);
  await client.publish(cfg, { title: "t", message: "m", priority: 4 });
  assert.equal("click" in JSON.parse(String(calls[0]!.init.body)), false);
});

test("401, 403 and 429 mean refused; 5xx and a lost network mean unreachable", async () => {
  for (const status of [401, 403, 429]) {
    const error = await fake(() => new Response("topic secret-topic denied", { status })).client.publish(cfg, message).catch((e) => e);
    assert.ok(error instanceof IntegrationError);
    assert.equal(error.kind, "refused");
    assert.equal(error.system, "ntfy");
  }
  const down = await fake(() => new Response("x", { status: 503 })).client.publish(cfg, message).catch((e) => e);
  assert.equal(down.kind, "unreachable");
  const lost = await fake(() => Promise.reject(new Error("connect ECONNREFUSED https://ntfy.example/secret-topic"))).client.publish(cfg, message).catch((e) => e);
  assert.equal(lost.kind, "unreachable");
});

test("an unreadable answer is a protocol error", async () => {
  const error = await fake(() => new Response("<html>", { status: 200 })).client.publish(cfg, message).catch((e) => e);
  assert.equal(error.kind, "protocol");
});

test("error messages never hold the topic, the body or the click URL", async () => {
  const replies = [() => new Response("secret-topic Fix the bug", { status: 403 }), () => new Response("secret-topic", { status: 500 }), () => new Response("secret-topic not json", { status: 200 }), () => Promise.reject(new Error("secret-topic"))];
  for (const reply of replies) {
    const error = await fake(reply).client.publish(cfg, message).catch((e) => e);
    for (const secret of ["secret-topic", "Fix the bug", "#/sessions/t1"]) assert.equal(error.message.includes(secret), false, error.message);
  }
});

test("check sends a test message and maps the answer", async () => {
  const good = fake(ok);
  assert.equal(await good.client.check(cfg), "ok");
  assert.equal(JSON.parse(String(good.calls[0]!.init.body)).topic, "secret-topic");
  assert.equal(await fake(() => new Response("", { status: 403 })).client.check(cfg), "refused");
  assert.equal(await fake(() => new Response("", { status: 502 })).client.check(cfg), "unreachable");
  assert.equal(await fake(() => Promise.reject(new Error("down"))).client.check(cfg), "unreachable");
});

test("newTopic gives a long random topic with a generic prefix that passes the topic rule", () => {
  const a = newTopic();
  assert.match(a, /^t3-dashboard-[A-Za-z0-9_-]{16}$/);
  assert.notEqual(a, newTopic());
});
