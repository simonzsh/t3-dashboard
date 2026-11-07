import assert from "node:assert/strict";
import { test } from "bun:test";
import { LinearClient } from "../../src/integrations/linear/client.ts";
import { LinearBoard, inboxItems } from "../../src/domain/linearBoard.ts";
import { linearInbox, linearInboxNode, linearNode, linearPage } from "../helpers/linear.ts";

interface Call {
  url: string;
  authorization: string | null;
  query: string;
  variables: Record<string, unknown> | undefined;
}

const NOW = new Date("2026-03-20T12:00:00.000Z");

function setup(apiKey: string, respond: (key: string, variables: Call["variables"]) => Response | Promise<Response>, inbox: () => Response = () => linearInbox([])) {
  const calls: Call[] = [];
  let clock = 1_000_000;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), authorization: headers.get("authorization"), query: body.query, variables: body.variables });
    if (body.query.includes("notifications")) return inbox();
    return respond(headers.get("authorization") ?? "", body.variables);
  };
  const board = new LinearBoard({
    client: new LinearClient(fetchFn),
    readKey: () => apiKey,
    now: () => new Date(clock),
  });
  return { board, calls, tick: (ms: number) => (clock += ms) };
}

test("reads the assigned issues of the key", async () => {
  const { board, calls } = setup("key-1", () => linearPage([linearNode(1)]));
  const result = await board.get();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.authorization), ["key-1", "key-1"]);
  assert.deepEqual(result, { configured: true, ok: true, error: null, issues: [linearNode(1)], readAt: "1970-01-01T00:16:40.000Z", inbox: [], inboxError: null });
});

test("a client failure becomes the board error", async () => {
  const { board, calls } = setup("key-1", () => linearPage([linearNode(1)], { hasNextPage: true, endCursor: "next" }));
  const result = await board.get();
  assert.equal(calls.filter((call) => !call.query.includes("notifications")).length, 20);
  assert.deepEqual(result, { configured: true, ok: false, error: "Too many assigned issues to load (over 2000)", issues: [], readAt: "1970-01-01T00:16:40.000Z", inbox: [], inboxError: null });
});

test("no key gives an unconfigured board without calling Linear", async () => {
  const { board, calls } = setup("", () => linearPage([]));
  const result = await board.get();
  assert.equal(calls.length, 0);
  assert.deepEqual(result, { configured: false, ok: false, error: "Missing API key", issues: [], readAt: "1970-01-01T00:16:40.000Z", inbox: [], inboxError: null });
});

test("an HTTP failure becomes the board error, without the key", async () => {
  const { board } = setup("key-bad", (key) => new Response(`denied ${key}`, { status: 401 }));
  const result = await board.get();
  assert.equal(result.ok, false);
  assert.match(result.error!, /401/);
  assert.ok(!JSON.stringify(result).includes("key-bad"));
});

test("GraphQL errors and network failures become the board error", async () => {
  const graphql = setup("key-1", () => new Response(JSON.stringify({ errors: [{ message: "bad key-1" }] }), { status: 200 }));
  const first = await graphql.board.get();
  assert.equal(first.ok, false);
  assert.ok(!JSON.stringify(first).includes("key-1"));
  const network = new LinearBoard({
    client: new LinearClient(async () => {
      throw new Error("connect failed for key-1");
    }),
    readKey: () => "key-1",
    now: () => new Date(),
  });
  const second = await network.get();
  assert.equal(second.ok, false);
  assert.ok(!JSON.stringify(second).includes("key-1"));
});

test("caches for 60 seconds and refresh forces a new read", async () => {
  const { board, calls, tick } = setup("key-1", () => linearPage([linearNode(1)]));
  await board.get();
  tick(59_000);
  await board.get();
  assert.equal(calls.length, 2);
  await board.get(true);
  assert.equal(calls.length, 4);
  tick(60_001);
  await board.get();
  assert.equal(calls.length, 6);
});

test("every team shows, whatever the teams are", async () => {
  const other = (n: number, key: string) => ({ ...linearNode(n), team: { key, name: `Team ${key}` } });
  const { board } = setup("k", () => linearPage([other(1, "ENG"), other(2, "OPS"), other(3, "HR")]));
  assert.deepEqual((await board.get()).issues.map((issue) => issue.team.key), ["ENG", "OPS", "HR"]);
});

test("a refused key shows a clear error without the key", async () => {
  const { board } = setup("key-bad", () => new Response("denied key-bad", { status: 400 }));
  const result = await board.get();
  assert.match(result.error!, /^Linear refused this key/);
  assert.ok(!JSON.stringify(result).includes("key-bad"));
});

test("invalidate drops the cache", async () => {
  const { board, calls } = setup("k", () => linearPage([]));
  await board.get();
  board.invalidate();
  await board.get();
  assert.equal(calls.length, 4);
});

test("a cached board keeps its read time, a refresh sets a new one", async () => {
  const { board, tick } = setup("key-1", () => linearPage([linearNode(1)]));
  const first = await board.get();
  tick(30_000);
  assert.equal((await board.get()).readAt, first.readAt);
  assert.equal((await board.get(true)).readAt, "1970-01-01T00:17:10.000Z");
});

test("the board holds the unread inbox, newest first", async () => {
  const { board } = setup("k", () => linearPage([linearNode(1)]), () => linearInbox([linearInboxNode(1, { createdAt: "2026-03-20T09:00:00.000Z" }), linearInboxNode(2, { createdAt: "2026-03-20T11:00:00.000Z" })]));
  assert.deepEqual((await board.get()).inbox.map((item) => item.id), ["notif-2", "notif-1"]);
});

test("a failed inbox keeps the issues and reports the inbox error", async () => {
  const { board } = setup("key-1", () => linearPage([linearNode(1)]), () => new Response("down key-1", { status: 500 }));
  const result = await board.get();
  assert.deepEqual([result.ok, result.error, result.issues.length, result.inbox], [true, null, 1, []]);
  assert.match(result.inboxError!, /500/);
  assert.ok(!JSON.stringify(result).includes("key-1"));
});

test("a failed issue read gives an empty inbox even when the inbox loaded", async () => {
  const { board } = setup("k", () => new Response("no", { status: 500 }), () => linearInbox([linearInboxNode(1)]));
  const result = await board.get();
  assert.deepEqual([result.ok, result.inbox, result.inboxError], [false, [], null]);
});

test("no key does not call the inbox", async () => {
  const { board, calls } = setup("", () => linearPage([]));
  await board.get();
  assert.equal(calls.length, 0);
});

test("one cache entry holds the issues and the inbox", async () => {
  const { board, calls, tick } = setup("k", () => linearPage([linearNode(1)]), () => linearInbox([linearInboxNode(1)]));
  const first = await board.get();
  tick(1000);
  assert.equal(await board.get(), first);
  assert.equal(calls.length, 2);
});

const kept = (nodes: unknown[]) => inboxItems(nodes as Parameters<typeof inboxItems>[0], NOW).map((item) => item.id);

test("inboxItems drops read, archived and future-snoozed notifications, keeps a past snooze", () => {
  assert.deepEqual(
    kept([
      linearInboxNode(1),
      linearInboxNode(2, { readAt: "2026-03-20T10:30:00.000Z" }),
      linearInboxNode(3, { archivedAt: "2026-03-20T10:30:00.000Z" }),
      linearInboxNode(4, { snoozedUntilAt: "2026-03-21T09:00:00.000Z" }),
      linearInboxNode(5, { snoozedUntilAt: "2026-03-20T08:00:00.000Z", createdAt: "2026-03-20T07:00:00.000Z" }),
    ]),
    ["notif-1", "notif-5"],
  );
});

test("inboxItems maps the three types and drops the others", () => {
  const items = inboxItems([linearInboxNode(1), linearInboxNode(2, { type: "issueCommentMention" }), linearInboxNode(3, { type: "issueAssignedToYou" }), linearInboxNode(4, { type: "issueNewComment" })] as never, NOW);
  assert.deepEqual(items.map((item) => item.kind).sort(), ["assigned", "comment-mention", "mention"]);
});

test("inboxItems drops assignments on completed or canceled issues, not mentions", () => {
  const closed = (type: string, notification: string) => linearInboxNode(1, { type: notification, issue: { ...linearInboxNode(1).issue, state: { type } } });
  assert.deepEqual(kept([closed("completed", "issueAssignedToYou"), closed("canceled", "issueAssignedToYou")]), []);
  assert.deepEqual(kept([closed("completed", "issueMention")]), ["notif-1"]);
});

test("inboxItems links a comment mention to its comment and the rest to the issue", () => {
  const nodes = [linearInboxNode(1, { type: "issueCommentMention", comment: { url: "https://linear.example/c1" } }), linearInboxNode(2, { type: "issueCommentMention" }), linearInboxNode(3, { comment: { url: "https://linear.example/c3" } })];
  assert.deepEqual(inboxItems(nodes as never, NOW).map((item) => item.url).sort(), ["https://linear.example/TEAM-2", "https://linear.example/TEAM-3", "https://linear.example/c1"]);
});

test("inboxItems names the user, else the bot, else nobody", () => {
  const nodes = [linearInboxNode(1), linearInboxNode(2, { actor: null, botActor: { name: "Linear Bot" } }), linearInboxNode(3, { actor: null }), linearInboxNode(4, { actor: null, botActor: { name: null } })];
  assert.deepEqual(inboxItems(nodes as never, NOW).map((item) => item.actor), ["Alex Doe", "Linear Bot", null, null]);
});

test("inboxItems sorts newest first", () => {
  assert.deepEqual(kept([linearInboxNode(1, { createdAt: "2026-03-19T10:00:00.000Z" }), linearInboxNode(2, { createdAt: "2026-03-20T10:00:00.000Z" }), linearInboxNode(3, { createdAt: "2026-03-20T09:00:00.000Z" })]), ["notif-2", "notif-3", "notif-1"]);
});
