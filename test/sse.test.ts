import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardEvent, DashboardState, DashboardThread } from "../shared/api.ts";
import { SseHub } from "../src/sse.ts";

/** Collects the text of an SSE response without waiting for it to end. */
class Reader {
  text = "";
  done = false;
  readonly response: Response;
  constructor(response: Response) {
    this.response = response;
    void this.pump(response.body!.pipeThrough(new TextDecoderStream()).getReader());
  }
  private async pump(reader: ReadableStreamDefaultReader<string>) {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.text += value;
      }
    } catch {
      // A cancelled stream rejects the pending read.
    }
    this.done = true;
  }
  get frames() {
    return this.text.split("\n\n").filter((frame) => frame.startsWith("event:"));
  }
}

const state = { connection: { t3: "live" }, projects: [], providers: [], threads: [] } as unknown as DashboardState;
const thread = (id: string, title = id) => ({ id, title }) as DashboardThread;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hubWith = () => new SseHub({ batchMs: 10, pingMs: 30 });
const open = (hub: SseHub, signal = new AbortController().signal) => new Reader(hub.add(state, signal));

test("add answers with the event-stream headers and the state frame first", async () => {
  const hub = hubWith();
  const res = open(hub);
  assert.equal(res.response.status, 200);
  assert.equal(res.response.headers.get("content-type"), "text/event-stream");
  assert.equal(res.response.headers.get("cache-control"), "no-cache");
  await wait(10);
  assert.equal(res.text, `event: state\ndata: ${JSON.stringify(state)}\n\n`);
  hub.close();
});

test("state, providers and connection events go out at once to every client", async () => {
  const hub = hubWith();
  const a = open(hub);
  const b = open(hub);
  const events: DashboardEvent[] = [
    { type: "providers", data: [] },
    { type: "connection", data: state.connection },
    { type: "state", data: state },
  ];
  for (const event of events) hub.broadcast(event);
  await wait(10);
  for (const res of [a, b]) {
    assert.deepEqual(
      res.frames.map((frame) => frame.split("\n")[0]),
      ["event: state", "event: providers", "event: connection", "event: state"],
    );
  }
  hub.close();
});

test("thread diffs are batched and merged by id: last upsert wins", async () => {
  const hub = hubWith();
  const res = open(hub);
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1", "first")], removed: [] } });
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1", "second"), thread("t2")], removed: [] } });
  await wait(5);
  assert.equal(res.frames.length, 1);
  await wait(40);
  const batch = res.frames.slice(1);
  assert.equal(batch.length, 1);
  const data = JSON.parse(batch[0]!.split("data: ")[1]!);
  assert.deepEqual(data, { upserted: [thread("t1", "second"), thread("t2")], removed: [] });
  hub.close();
});

test("a removal cancels an earlier upsert, and an upsert cancels an earlier removal", async () => {
  const hub = hubWith();
  const res = open(hub);
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1")], removed: [] } });
  hub.broadcast({ type: "threads", data: { upserted: [], removed: ["t1"] } });
  hub.broadcast({ type: "projects", data: { upserted: [], removed: ["p1"] } });
  hub.broadcast({ type: "projects", data: { upserted: [{ id: "p1", title: "A", defaultModelSelection: null }], removed: [] } });
  await wait(40);
  const [, threads, projects] = res.frames;
  assert.deepEqual(JSON.parse(threads!.split("data: ")[1]!), { upserted: [], removed: ["t1"] });
  assert.equal(projects!.split("\n")[0], "event: projects");
  assert.deepEqual(JSON.parse(projects!.split("data: ")[1]!), { upserted: [{ id: "p1", title: "A", defaultModelSelection: null }], removed: [] });
  hub.close();
});

test("a state event drops the pending diffs it already includes", async () => {
  const hub = hubWith();
  const res = open(hub);
  hub.broadcast({ type: "threads", data: { upserted: [thread("t1")], removed: [] } });
  hub.broadcast({ type: "state", data: state });
  await wait(40);
  assert.deepEqual(
    res.frames.map((frame) => frame.split("\n")[0]),
    ["event: state", "event: state"],
  );
  hub.close();
});

test("pings go out as comments and an aborted client is forgotten", async () => {
  const hub = hubWith();
  const abort = new AbortController();
  const res = open(hub, abort.signal);
  await wait(80);
  assert.ok(res.text.includes(": ping\n\n"));
  abort.abort();
  const before = res.text;
  hub.broadcast({ type: "providers", data: [] });
  await wait(80);
  assert.equal(res.text, before);
  hub.close();
});

test("a cancelled stream is forgotten", async () => {
  const hub = hubWith();
  const stream = hub.add(state, new AbortController().signal).body!;
  await stream.cancel();
  assert.doesNotThrow(() => hub.broadcast({ type: "providers", data: [] }));
  hub.close();
});

test("close ends every client", async () => {
  const hub = hubWith();
  const res = open(hub);
  hub.close();
  await wait(10);
  assert.equal(res.done, true);
});
