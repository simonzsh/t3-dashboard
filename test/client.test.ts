import assert from "node:assert/strict";
import { beforeEach, test } from "bun:test";
import { MissingTokenError, T3Client, T3HttpError } from "../src/t3/client.ts";
import { FakeSocket, tick } from "./helpers/fakeSocket.ts";

beforeEach(() => FakeSocket.reset());

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function setup(origin = "http://127.0.0.1:3773/") {
  const calls: Call[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string> });
    if (url.endsWith("/api/auth/websocket-ticket")) return Response.json({ ticket: "ticket-1" });
    return Response.json({ projection: { messages: [] } });
  }) as unknown as typeof fetch;
  const client = new T3Client({
    origin: async () => origin,
    token: () => "test-token",
    fetch: fakeFetch,
    WebSocket: FakeSocket as unknown as typeof WebSocket,
  });
  return { client, calls };
}

async function nextSocket(): Promise<FakeSocket> {
  for (let i = 0; i < 20 && FakeSocket.instances.length === 0; i++) await tick();
  const socket = FakeSocket.instances[0];
  assert.ok(socket, "no socket opened");
  socket.open();
  return socket;
}

test("threadProjection sends the Bearer and protocol headers and strips the trailing slash", async () => {
  const { client, calls } = setup();
  await client.threadProjection("thread 1");
  assert.equal(calls[0]!.url, "http://127.0.0.1:3773/api/orchestration/threads/thread%201");
  assert.equal(calls[0]!.headers.authorization, "Bearer test-token");
  assert.equal(calls[0]!.headers["x-t3-orchestration-protocol"], "2");
});

test("dispatch fetches a ticket first, then opens the ws URL, then closes the socket", async () => {
  const { client, calls } = setup();
  const done = client.dispatch({ type: "thread.pin", threadId: "t" });
  const socket = await nextSocket();
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "http://127.0.0.1:3773/api/auth/websocket-ticket");
  assert.equal(socket.url, "ws://127.0.0.1:3773/ws?wsTicket=ticket-1&orchestrationProtocol=2");
  assert.deepEqual(socket.sent[0], { _tag: "Request", id: "1", tag: "orchestration.dispatchCommand", payload: { type: "thread.pin", threadId: "t" }, headers: [] });
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { sequence: 3 } } });
  assert.deepEqual(await done, { sequence: 3 });
  assert.equal(socket.closed, true);
});

test("dispatch closes the socket when T3 refuses the command", async () => {
  const { client } = setup();
  const done = client.dispatch({ type: "x" });
  const socket = await nextSocket();
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Failure", cause: { message: "refused" } } });
  await assert.rejects(done, /refused/);
  assert.equal(socket.closed, true);
});

test("https origins give wss URLs", async () => {
  const { client } = setup("https://t3.example");
  const done = client.getConfig();
  const socket = await nextSocket();
  assert.ok(socket.url.startsWith("wss://t3.example/ws?"));
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { providers: [] } } });
  assert.deepEqual(await done, { providers: [] });
});

test("getConfig uses the server.getConfig tag", async () => {
  const { client } = setup();
  const done = client.getConfig();
  const socket = await nextSocket();
  assert.equal(socket.sent[0]!.tag, "server.getConfig");
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: {} } });
  await done;
});

test("persistAttachments sends the images and returns T3's references", async () => {
  const { client } = setup();
  const image = { type: "image" as const, name: "a.png", mimeType: "image/png", sizeBytes: 3, dataUrl: "data:image/png;base64,AAAA" };
  const done = client.persistAttachments("thread-1", "msg-1", [image]);
  const socket = await nextSocket();
  assert.equal(socket.sent[0]!.tag, "assets.persistChatAttachments");
  assert.deepEqual(socket.sent[0]!.payload, { threadId: "thread-1", messageId: "msg-1", attachments: [image] });
  const ref = { type: "image", id: "img-1", name: "a.png", mimeType: "image/png", sizeBytes: 3 };
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { attachments: [ref] } } });
  assert.deepEqual(await done, [ref]);
});

test("subscribeShell streams items on a long-lived socket and cancel interrupts it", async () => {
  const { client } = setup();
  const seen: unknown[][] = [];
  const handle = client.subscribeShell((items) => seen.push(items), () => {});
  const socket = await nextSocket();
  assert.equal(socket.sent[0]!.tag, "orchestration.subscribeShell");
  assert.deepEqual(socket.sent[0]!.payload, { requestCompletionMarker: true });
  socket.receive({ _tag: "Chunk", requestId: "1", values: [{ kind: "synchronized" }] });
  assert.deepEqual(seen, [[{ kind: "synchronized" }]]);
  assert.equal(socket.closed, false);
  handle.cancel();
  assert.deepEqual(socket.sent.at(-1), { _tag: "Interrupt", requestId: "1" });
  assert.equal(socket.closed, true);
});

test("subscribeShell reports a failed ticket request through onEnd", async () => {
  const failing = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => "test-token", fetch: failing, WebSocket: FakeSocket as unknown as typeof WebSocket });
  const error = await new Promise<Error | undefined>((resolve) => client.subscribeShell(() => {}, resolve));
  assert.match(error!.message, /401/);
  assert.ok(!error!.message.includes("test-token"));
});

test("subscribeShell cancelled before the socket opens never opens one", async () => {
  const { client } = setup();
  const handle = client.subscribeShell(() => {}, () => {});
  handle.cancel();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(FakeSocket.instances.every((socket) => socket.closed), true);
});

test("a refused ticket request throws a T3HttpError with the status", async () => {
  const failing = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => "test-token", fetch: failing, WebSocket: FakeSocket as unknown as typeof WebSocket });
  const error = await client.threadProjection("t").catch((e: unknown) => e);
  assert.ok(error instanceof T3HttpError);
  assert.equal(error.status, 403);
});

test("without a token no request leaves, and the token is read on every request", async () => {
  let token: string | null = null;
  const calls: string[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    calls.push((init.headers as Record<string, string>).authorization!);
    return Response.json({ projection: {} });
  }) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => token, fetch: fakeFetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
  await assert.rejects(client.threadProjection("t"), MissingTokenError);
  assert.equal(calls.length, 0);
  token = "later";
  await client.threadProjection("t");
  assert.deepEqual(calls, ["Bearer later"]);
});
