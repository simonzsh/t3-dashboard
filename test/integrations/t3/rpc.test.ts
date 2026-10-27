import assert from "node:assert/strict";
import { beforeEach, test } from "bun:test";
import { IntegrationError } from "../../../src/integrations/errors.ts";
import { RpcConnection } from "../../../src/integrations/t3/rpc.ts";
import { FakeSocket, tick } from "../../helpers/fakeSocket.ts";

beforeEach(() => FakeSocket.reset());

function connect() {
  const rpc = new RpcConnection("ws://t3/ws", FakeSocket as unknown as typeof WebSocket);
  const socket = FakeSocket.instances[0]!;
  return { rpc, socket };
}

test("request sends a Request frame after open and resolves on Success", async () => {
  const { rpc, socket } = connect();
  const result = rpc.request("server.getConfig", { a: 1 });
  assert.deepEqual(socket.sent, []);
  socket.open();
  assert.deepEqual(socket.sent, [{ _tag: "Request", id: "1", tag: "server.getConfig", payload: { a: 1 }, headers: [] }]);
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: { ok: 1 } } });
  assert.deepEqual(await result, { ok: 1 });
  rpc.close();
});

test("request ids increase as strings", () => {
  const { rpc, socket } = connect();
  socket.open();
  rpc.request("a", {}).catch(() => {});
  rpc.request("b", {}).catch(() => {});
  assert.deepEqual(
    socket.sent.map((frame) => frame.id),
    ["1", "2"],
  );
  rpc.close();
});

test("a failed Exit rejects with the cause message", async () => {
  const { rpc, socket } = connect();
  socket.open();
  const result = rpc.request("x", {});
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Failure", cause: { message: "nope", commandType: "thread.pin" } } });
  await assert.rejects(result, (error: Error) => error instanceof IntegrationError && error.kind === "refused" && error.message === "T3 refused the request: thread.pin: nope");
  rpc.close();
});

test("a wrapped dispatch failure shows commandType and message", async () => {
  const { rpc, socket } = connect();
  socket.open();
  const result = rpc.request("x", {});
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Failure", cause: { _tag: "Fail", error: { commandType: "thread.pin", message: "no such thread" } } } });
  await assert.rejects(result, /thread\.pin: no such thread/);
  rpc.close();
});

test("a failed Exit without message falls back to the JSON of the cause", async () => {
  const { rpc, socket } = connect();
  socket.open();
  const result = rpc.request("x", {});
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Failure", cause: { code: 42 } } });
  await assert.rejects(result, /"code":42/);
  rpc.close();
});

test("Exits of other request ids are ignored", async () => {
  const { rpc, socket } = connect();
  socket.open();
  const result = rpc.request("x", {});
  socket.receive({ _tag: "Exit", requestId: "99", exit: { _tag: "Success", value: "wrong" } });
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: "right" } });
  assert.equal(await result, "right");
  rpc.close();
});

test("request rejects on timeout", async () => {
  const { rpc, socket } = connect();
  socket.open();
  await assert.rejects(rpc.request("slow", {}, 5), /slow/);
  rpc.close();
});

test("request rejects when the socket closes", async () => {
  const { rpc, socket } = connect();
  socket.open();
  const result = rpc.request("x", {});
  socket.close();
  await assert.rejects(result, /closed/);
  rpc.close();
});

test("request rejects when the socket errors before open", async () => {
  const { rpc, socket } = connect();
  const result = rpc.request("x", {});
  socket.fail();
  await assert.rejects(result);
  rpc.close();
});

test("stream delivers every value of a Chunk then sends Ack", () => {
  const { rpc, socket } = connect();
  socket.open();
  const seen: unknown[][] = [];
  rpc.stream("orchestration.subscribeShell", {}, (values) => seen.push(values), () => {});
  socket.receive({ _tag: "Chunk", requestId: "1", values: ["a", "b"] });
  socket.receive({ _tag: "Chunk", requestId: "1", values: ["c"] });
  assert.deepEqual(seen, [["a", "b"], ["c"]]);
  assert.deepEqual(socket.sent.slice(1), [
    { _tag: "Ack", requestId: "1" },
    { _tag: "Ack", requestId: "1" },
  ]);
  rpc.close();
});

test("stream ignores chunks of other requests", () => {
  const { rpc, socket } = connect();
  socket.open();
  const seen: unknown[][] = [];
  rpc.stream("t", {}, (values) => seen.push(values), () => {});
  socket.receive({ _tag: "Chunk", requestId: "7", values: ["x"] });
  assert.deepEqual(seen, []);
  rpc.close();
});

test("cancel sends Interrupt and silences the stream", () => {
  const { rpc, socket } = connect();
  socket.open();
  const seen: unknown[][] = [];
  let ended = 0;
  const handle = rpc.stream("t", {}, (values) => seen.push(values), () => ended++);
  handle.cancel();
  assert.deepEqual(socket.sent.at(-1), { _tag: "Interrupt", requestId: "1" });
  socket.receive({ _tag: "Chunk", requestId: "1", values: ["late"] });
  assert.deepEqual(seen, []);
  assert.equal(ended, 0);
  rpc.close();
});

test("stream Exit calls onEnd; a failed Exit passes an error", () => {
  const { rpc, socket } = connect();
  socket.open();
  const ends: Array<Error | undefined> = [];
  rpc.stream("a", {}, () => {}, (error) => ends.push(error));
  rpc.stream("b", {}, () => {}, (error) => ends.push(error));
  socket.receive({ _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: null } });
  socket.receive({ _tag: "Exit", requestId: "2", exit: { _tag: "Failure", cause: { message: "bad" } } });
  assert.equal(ends[0], undefined);
  assert.match(ends[1]!.message, /bad/);
  rpc.close();
});

test("socket close and error end streams with an error", async () => {
  const { rpc, socket } = connect();
  socket.open();
  const ends: Array<Error | undefined> = [];
  rpc.stream("a", {}, () => {}, (error) => ends.push(error));
  socket.close();
  await tick();
  assert.equal(ends.length, 1);
  assert.ok(ends[0] instanceof IntegrationError);
  assert.deepEqual([ends[0].kind, ends[0].message], ["unreachable", "T3 WebSocket closed"]);
});

test("Pong frames are ignored and bad frames do not throw", () => {
  const { rpc, socket } = connect();
  socket.open();
  socket.receive({ _tag: "Pong" });
  socket.onmessage?.({ data: "not json" });
  rpc.close();
});

test("isOpen turns true on open and isClosed on close", () => {
  const { rpc, socket } = connect();
  assert.deepEqual([rpc.isOpen, rpc.isClosed], [false, false]);
  socket.open();
  assert.deepEqual([rpc.isOpen, rpc.isClosed], [true, false]);
  rpc.close();
  assert.deepEqual([rpc.isOpen, rpc.isClosed], [true, true]);
});
