import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { DashboardEvent, DashboardState, DashboardThread } from "../shared/api.ts";
import { SseHub } from "../src/sse.ts";

class FakeRes extends EventEmitter {
  head: { status: number; headers: Record<string, string> } | null = null;
  flushed = false;
  chunks: string[] = [];
  ended = false;
  writeHead(status: number, headers: Record<string, string>) {
    this.head = { status, headers };
    return this;
  }
  flushHeaders() {
    this.flushed = true;
  }
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.ended = true;
  }
  get text() {
    return this.chunks.join("");
  }
}

const state = { connection: { t3: "live" }, projects: [], providers: [], threads: [], generatedAt: "t" } as unknown as DashboardState;
const thread = (id: string, title = id) => ({ id, title }) as DashboardThread;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hubWith = () => new SseHub({ batchMs: 10, pingMs: 30 });
const frames = (res: FakeRes) => res.text.split("\n\n").filter((frame) => frame.startsWith("event:"));
const asRes = (res: FakeRes) => res as never;

test("add sends the headers at once and the state frame first", () => {
  const hub = hubWith();
  const res = new FakeRes();
  hub.add(asRes(res), state);
  assert.equal(res.head!.status, 200);
  assert.deepEqual(res.head!.headers, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  assert.equal(res.flushed, true);
  assert.equal(res.chunks[0], `event: state\ndata: ${JSON.stringify(state)}\n\n`);
  hub.close();
});

test("state, providers and connection events go out at once to every client", () => {
  const hub = hubWith();
  const a = new FakeRes();
  const b = new FakeRes();
  hub.add(asRes(a), state);
  hub.add(asRes(b), state);
  const events: DashboardEvent[] = [
    { type: "providers", data: [] },
    { type: "connection", data: state.connection },
    { type: "state", data: state },
  ];
  for (const event of events) hub.broadcast(event);
  for (const res of [a, b]) {
    assert.deepEqual(
      frames(res).map((frame) => frame.split("\n")[0]),
      ["event: state", "event: providers", "event: connection", "event: state"],
    );
  }
  hub.close();
});

test("thread diffs are batched and merged by id: last upsert wins", async () => {
  const hub = hubWith();
  const res = new FakeRes();
  hub.add(asRes(res), state);
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1", "first")], removed: [] } });
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1", "second"), thread("t2")], removed: [] } });
  assert.equal(frames(res).length, 1);
  await wait(40);
  const batch = frames(res).slice(1);
  assert.equal(batch.length, 1);
  const data = JSON.parse(batch[0]!.split("data: ")[1]!);
  assert.deepEqual(data, { upserted: [thread("t1", "second"), thread("t2")], removed: [] });
  hub.close();
});

test("a removal cancels an earlier upsert, and an upsert cancels an earlier removal", async () => {
  const hub = hubWith();
  const res = new FakeRes();
  hub.add(asRes(res), state);
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1")], removed: [] } });
  hub.broadcast({ type: "threads", data: { upserted: [], removed: ["t1"] } });
  hub.broadcast({ type: "projects", data: { upserted: [], removed: ["p1"] } });
  hub.broadcast({ type: "projects", data: { upserted: [{ id: "p1", title: "A", defaultModelSelection: null }], removed: [] } });
  await wait(40);
  const [, threads, projects] = frames(res);
  assert.deepEqual(JSON.parse(threads!.split("data: ")[1]!), { upserted: [], removed: ["t1"] });
  assert.equal(projects!.split("\n")[0], "event: projects");
  assert.deepEqual(JSON.parse(projects!.split("data: ")[1]!), { upserted: [{ id: "p1", title: "A", defaultModelSelection: null }], removed: [] });
  hub.close();
});

test("a state event drops the pending diffs it already includes", async () => {
  const hub = hubWith();
  const res = new FakeRes();
  hub.add(asRes(res), state);
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1")], removed: [] } });
  hub.broadcast({ type: "state", data: state });
  await wait(40);
  assert.deepEqual(
    frames(res).map((frame) => frame.split("\n")[0]),
    ["event: state", "event: state"],
  );
  hub.close();
});

test("pings go out as comments and a closed client is forgotten", async () => {
  const hub = hubWith();
  const res = new FakeRes();
  hub.add(asRes(res), state);
  await wait(80);
  assert.ok(res.text.includes(": ping\n\n"));
  res.emit("close");
  const before = res.chunks.length;
  hub.broadcast({ type: "providers", data: [] });
  await wait(80);
  assert.equal(res.chunks.length, before);
  hub.close();
});

test("close ends every client", () => {
  const hub = hubWith();
  const res = new FakeRes();
  hub.add(asRes(res), state);
  hub.close();
  assert.equal(res.ended, true);
});
