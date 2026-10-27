import assert from "node:assert/strict";
import { beforeEach, test } from "bun:test";
import { IntegrationError } from "../../../src/integrations/errors.ts";
import { T3Client } from "../../../src/integrations/t3/client.ts";
import { FakeSocket, tick } from "../../helpers/fakeSocket.ts";

beforeEach(() => FakeSocket.reset());

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function setup(origin = "http://127.0.0.1:3773/", projection: unknown = { messages: [] }) {
  const calls: Call[] = [];
  const warnings: string[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string> });
    if (url.endsWith("/api/auth/websocket-ticket")) return Response.json({ ticket: "ticket-1" });
    return Response.json({ projection });
  }) as unknown as typeof fetch;
  const client = new T3Client({
    origin: async () => origin,
    token: () => "test-token",
    fetch: fakeFetch,
    WebSocket: FakeSocket as unknown as typeof WebSocket,
    warn: (message) => warnings.push(message),
  });
  return { client, calls, warnings };
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

test("dispatch fetches a ticket first, then opens the ws URL and keeps the socket", async () => {
  const { client, calls } = setup();
  const done = client.dispatch({ type: "thread.pin", threadId: "t" });
  const socket = await nextSocket();
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "http://127.0.0.1:3773/api/auth/websocket-ticket");
  assert.equal(socket.url, "ws://127.0.0.1:3773/ws?wsTicket=ticket-1&orchestrationProtocol=2");
  assert.deepEqual(socket.sent[0], { _tag: "Request", id: "1", tag: "orchestration.dispatchCommand", payload: { type: "thread.pin", threadId: "t" }, headers: [] });
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { sequence: 3 } } });
  assert.deepEqual(await done, { sequence: 3 });
  assert.equal(socket.closed, false);
});

test("dispatch keeps the socket when T3 refuses the command", async () => {
  const { client } = setup();
  const done = client.dispatch({ type: "x" });
  const socket = await nextSocket();
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Failure", cause: { message: "refused" } } });
  await assert.rejects(done, /refused/);
  assert.equal(socket.closed, false);
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

test("a refused token is not-authenticated, another refusal is refused, both with the status", async () => {
  for (const [status, kind] of [[403, "not-authenticated"], [401, "not-authenticated"], [500, "refused"]] as const) {
    const failing = (async () => new Response("no", { status })) as unknown as typeof fetch;
    const client = new T3Client({ origin: async () => "http://t3", token: () => "test-token", fetch: failing, WebSocket: FakeSocket as unknown as typeof WebSocket });
    const error = await client.threadProjection("t").catch((e: unknown) => e);
    assert.ok(error instanceof IntegrationError);
    assert.deepEqual([error.system, error.kind, error.status, error.message], ["t3", kind, status, `T3 answered ${status} on GET /api/orchestration/threads/t`]);
  }
});

test("a network failure is unreachable and keeps its message", async () => {
  const offline = (async () => {
    throw new Error("Unable to connect");
  }) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => "test-token", fetch: offline, WebSocket: FakeSocket as unknown as typeof WebSocket });
  const error = await client.threadProjection("t").catch((e: unknown) => e);
  assert.ok(error instanceof IntegrationError);
  assert.deepEqual([error.kind, error.message], ["unreachable", "Unable to connect"]);
});

test("without a token no request leaves, and the token is read on every request", async () => {
  let token: string | null = null;
  const calls: string[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    calls.push((init.headers as Record<string, string>).authorization!);
    return Response.json({ projection: {} });
  }) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => token, fetch: fakeFetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
  await assert.rejects(client.threadProjection("t"), (error: Error) => error instanceof IntegrationError && error.kind === "not-authenticated" && error.status === undefined);
  assert.equal(calls.length, 0);
  token = "later";
  await client.threadProjection("t");
  assert.deepEqual(calls, ["Bearer later"]);
});

const protocolError = async (promise: Promise<unknown>): Promise<IntegrationError> => {
  const error = await promise.then(() => undefined, (caught: unknown) => caught);
  assert.ok(error instanceof IntegrationError);
  assert.deepEqual([error.system, error.kind], ["t3", "protocol"]);
  return error;
};

test("a projection of the wrong shape is a protocol error that names the field, not the value", async () => {
  const { client } = setup(undefined, { messages: [{ id: "m1", role: "user", text: 42 }], thread: { id: "t", title: "secret title" } });
  const error = await protocolError(client.threadProjection("t"));
  assert.equal(error.message, "Unexpected T3 thread projection: projection.messages[0].text should be string, got number");
});

test("a ticket answer without a ticket is a protocol error", async () => {
  const fakeFetch = (async () => Response.json({ token: "x" })) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => "test-token", fetch: fakeFetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
  const error = await protocolError(client.getConfig());
  assert.match(error.message, /ticket should be string, got undefined/);
});

test("getConfig and persistAttachments check T3's answer", async () => {
  const { client } = setup();
  const config = client.getConfig();
  const socket = await nextSocket();
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { providers: [{ instanceId: 7 }] } } });
  assert.match((await protocolError(config)).message, /^Unexpected T3 server\.getConfig: providers\[0\]\.instanceId should be string, got number$/);
  FakeSocket.reset();
  const upload = client.persistAttachments("t", "m", []);
  const second = await nextSocket();
  second.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { attachments: [{ id: "a" }] } } });
  assert.match((await protocolError(upload)).message, /attachments\[0\]\.type should be string/);
});

test("subscribeShell passes every item on and warns once per wrong field, without values", async () => {
  const { client, warnings } = setup();
  const seen: unknown[][] = [];
  client.subscribeShell((items) => seen.push(items), () => {});
  const socket = await nextSocket();
  const bad = { kind: "thread.updated", thread: { id: "t1", title: 99, status: "secret-status" } };
  socket.receive({ _tag: "Chunk", requestId: "1", values: [bad, { kind: "thread.renamed", whatever: 1 }] });
  socket.receive({ _tag: "Chunk", requestId: "1", values: [bad] });
  assert.deepEqual(seen, [[bad, { kind: "thread.renamed", whatever: 1 }], [bad]]);
  assert.deepEqual(warnings, ["T3 contract: orchestration.subscribeShell item thread.title should be string or null, got number"]);
});

test("searchThreads sends the query and limit and returns the matches", async () => {
  const { client } = setup();
  const done = client.searchThreads("deploy", 10);
  const socket = await nextSocket();
  assert.equal(socket.sent[0]!.tag, "orchestration.searchThreads");
  assert.deepEqual(socket.sent[0]!.payload, { query: "deploy", limit: 10 });
  const match = { threadId: "t1", projectId: "p1", source: "user", snippet: "to deploy", messageCreatedAt: null };
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { matches: [match] } } });
  assert.deepEqual(await done, [match]);
});

test("searchThreads omits the limit when none is given", async () => {
  const { client } = setup();
  const done = client.searchThreads("deploy");
  const socket = await nextSocket();
  assert.deepEqual(socket.sent[0]!.payload, { query: "deploy" });
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { matches: [] } } });
  assert.deepEqual(await done, []);
});

test("a search answer of the wrong shape is a protocol error", async () => {
  const { client } = setup();
  const done = client.searchThreads("deploy");
  const socket = await nextSocket();
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { matches: [{ threadId: "t1" }] } } });
  assert.match((await protocolError(done)).message, /matches\[0\]\.projectId should be string/);
});

const ok = (id: string, value: unknown = {}) => ({ _tag: "Exit", requestId: id, exit: { _tag: "Success", value } });
const tickets = (calls: Call[]) => calls.filter((call) => call.url.endsWith("/api/auth/websocket-ticket")).length;

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 30 && !condition(); i++) await tick();
  assert.ok(condition(), "condition never held");
}

test("two dispatches share one ticket and one open socket", async () => {
  const { client, calls } = setup();
  const first = client.dispatch({ type: "a" });
  const socket = await nextSocket();
  socket.receive(ok("1", { sequence: 1 }));
  await first;
  const second = client.dispatch({ type: "b" });
  await waitFor(() => socket.sent.length === 2);
  socket.receive(ok("2", { sequence: 2 }));
  assert.deepEqual(await second, { sequence: 2 });
  assert.equal(tickets(calls), 1);
  assert.equal(FakeSocket.instances.length, 1);
  assert.equal(socket.closed, false);
});

test("calls made before the socket opens share its ticket and socket", async () => {
  const { client, calls } = setup();
  const config = client.getConfig();
  const dispatched = client.dispatch({ type: "a" });
  const socket = await nextSocket();
  await waitFor(() => socket.sent.length === 2);
  assert.deepEqual(socket.sent.map((frame) => frame.id), ["1", "2"]);
  socket.receive(ok("1", { providers: [] }));
  socket.receive(ok("2", { sequence: 1 }));
  await Promise.all([config, dispatched]);
  assert.equal(tickets(calls), 1);
  assert.equal(FakeSocket.instances.length, 1);
});

test("after the socket closes the next call opens a new one", async () => {
  const { client, calls } = setup();
  const first = client.getConfig();
  const socket = await nextSocket();
  socket.receive(ok("1"));
  await first;
  socket.close();
  FakeSocket.reset();
  const second = client.getConfig();
  const next = await nextSocket();
  next.receive(ok("1"));
  await second;
  assert.equal(tickets(calls), 2);
});

test("an error before the socket opens falls back to a one-shot socket, even for dispatch", async () => {
  const { client, calls } = setup();
  const done = client.dispatch({ type: "a" });
  await waitFor(() => FakeSocket.instances.length === 1);
  FakeSocket.instances[0]!.fail();
  FakeSocket.instances[0]!.close();
  await waitFor(() => FakeSocket.instances.length === 2);
  const retry = FakeSocket.instances[1]!;
  retry.open();
  retry.receive(ok("1", { sequence: 9 }));
  assert.deepEqual(await done, { sequence: 9 });
  assert.equal(tickets(calls), 2);
  assert.equal(retry.closed, true);
});

test("a dispatch cut after the socket opened is never sent twice", async () => {
  const { client } = setup();
  const done = client.dispatch({ type: "a" });
  const socket = await nextSocket();
  socket.close();
  await assert.rejects(done, (error: Error) => error instanceof IntegrationError && error.kind === "unreachable");
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(FakeSocket.instances.length, 1);
  assert.equal(socket.sent.length, 1);
});

test("an idempotent call cut after the socket opened is retried once", async () => {
  const { client } = setup();
  const done = client.searchThreads("x");
  const socket = await nextSocket();
  socket.close();
  await waitFor(() => FakeSocket.instances.length === 2);
  const retry = FakeSocket.instances[1]!;
  retry.open();
  retry.receive(ok("1", { matches: [] }));
  assert.deepEqual(await done, []);
});

test("a refused request keeps the socket for the next call", async () => {
  const { client, calls } = setup();
  const refused = client.dispatch({ type: "a" });
  const socket = await nextSocket();
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Failure", cause: { message: "no" } } });
  await assert.rejects(refused, /no/);
  const next = client.dispatch({ type: "b" });
  await waitFor(() => socket.sent.length === 2);
  socket.receive(ok("2"));
  await next;
  assert.equal(tickets(calls), 1);
  assert.equal(FakeSocket.instances.length, 1);
});

test("a timeout closes the socket and the next call opens a new one", async () => {
  const { client, calls } = setup();
  const slow = client.getConfig();
  const socket = await nextSocket();
  socket.receive(ok("1"));
  await slow;
  // The default 10 s timeout is too long for a test: call with 5 ms.
  const stuck = (client as unknown as { call(tag: string, payload: unknown, ms: number): Promise<unknown> }).call("server.getConfig", {}, 5);
  await assert.rejects(stuck, /did not answer/);
  assert.equal(socket.closed, true);
  FakeSocket.reset();
  const next = client.getConfig();
  const fresh = await nextSocket();
  fresh.receive(ok("1"));
  await next;
  assert.equal(tickets(calls), 2);
});

test("a timeout leaves other pending calls on the socket, which closes once they settle", async () => {
  const { client } = setup();
  const other = client.getConfig();
  const socket = await nextSocket();
  const stuck = (client as unknown as { call(tag: string, payload: unknown, ms: number): Promise<unknown> }).call("server.getConfig", {}, 5);
  await assert.rejects(stuck, /did not answer/);
  assert.equal(socket.closed, false);
  socket.receive(ok("1"));
  await other;
  assert.equal(socket.closed, true);
});

test("a new token opens a new socket with a new ticket", async () => {
  let token = "one";
  const calls: Call[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string> });
    return Response.json({ ticket: "t" });
  }) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => token, fetch: fakeFetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
  const first = client.getConfig();
  const socket = await nextSocket();
  socket.receive(ok("1"));
  await first;
  token = "two";
  const second = client.getConfig();
  await waitFor(() => FakeSocket.instances.length === 2);
  FakeSocket.instances[1]!.open();
  FakeSocket.instances[1]!.receive(ok("1"));
  await second;
  assert.deepEqual(calls.map((call) => call.headers.authorization), ["Bearer one", "Bearer two"]);
  assert.equal(socket.closed, true);
});

test("a new token leaves a busy old socket open until its call settles", async () => {
  let token = "one";
  const fakeFetch = (async () => Response.json({ ticket: "t" })) as unknown as typeof fetch;
  const client = new T3Client({ origin: async () => "http://t3", token: () => token, fetch: fakeFetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
  const slow = client.getConfig();
  const socket = await nextSocket();
  token = "two";
  const second = client.getConfig();
  await waitFor(() => FakeSocket.instances.length === 2);
  assert.equal(socket.closed, false);
  socket.receive(ok("1"));
  await slow;
  assert.equal(socket.closed, true);
  FakeSocket.instances[1]!.open();
  FakeSocket.instances[1]!.receive(ok("1"));
  await second;
});

test("persistAttachments uses its own socket and closes it", async () => {
  const { client } = setup();
  const config = client.getConfig();
  const shared = await nextSocket();
  shared.receive(ok("1"));
  await config;
  const upload = client.persistAttachments("t", "m", []);
  await waitFor(() => FakeSocket.instances.length === 2);
  const own = FakeSocket.instances[1]!;
  own.open();
  own.receive(ok("1", { attachments: [] }));
  await upload;
  assert.equal(own.closed, true);
  assert.equal(shared.closed, false);
});

test("close ends the shared socket", async () => {
  const { client } = setup();
  const config = client.getConfig();
  const socket = await nextSocket();
  socket.receive(ok("1"));
  await config;
  client.close();
  await waitFor(() => socket.closed);
});
