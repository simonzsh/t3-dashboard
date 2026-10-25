import assert from "node:assert/strict";
import { test } from "bun:test";
import { LinearClient } from "../../src/integrations/linear/client.ts";
import { LinearBoard } from "../../src/domain/linearBoard.ts";

const node = (n: number) => ({
  id: `issue-${n}`,
  identifier: `TEAM-${n}`,
  title: `Issue ${n}`,
  url: `https://linear.example/TEAM-${n}`,
  priority: 2,
  priorityLabel: "High",
  updatedAt: "2026-03-20T10:00:00.000Z",
  state: { name: "Todo", type: "unstarted", color: "#ccc" },
  project: { id: "lp-1", name: "Linear Project 1" },
  team: { key: "TEAM", name: "Team 1" },
});

const reply = (nodes: unknown[], pageInfo: { hasNextPage: boolean; endCursor: string | null } = { hasNextPage: false, endCursor: null }) =>
  new Response(JSON.stringify({ data: { viewer: { assignedIssues: { nodes, pageInfo } } } }), { status: 200 });

interface Call {
  url: string;
  authorization: string | null;
  query: string;
  variables: Record<string, unknown> | undefined;
}

function setup(apiKey: string, respond: (key: string, variables: Call["variables"]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let clock = 1_000_000;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), authorization: headers.get("authorization"), query: body.query, variables: body.variables });
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
  const { board, calls } = setup("key-1", () => reply([node(1)]));
  const result = await board.get();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.authorization, "key-1");
  assert.deepEqual(result, { configured: true, ok: true, error: null, issues: [node(1)] });
});

test("a client failure becomes the board error", async () => {
  const { board, calls } = setup("key-1", () => reply([node(1)], { hasNextPage: true, endCursor: "next" }));
  const result = await board.get();
  assert.equal(calls.length, 20);
  assert.deepEqual(result, { configured: true, ok: false, error: "Too many assigned issues to load (over 2000)", issues: [] });
});

test("no key gives an unconfigured board without calling Linear", async () => {
  const { board, calls } = setup("", () => reply([]));
  const result = await board.get();
  assert.equal(calls.length, 0);
  assert.deepEqual(result, { configured: false, ok: false, error: "Missing API key", issues: [] });
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
  const { board, calls, tick } = setup("key-1", () => reply([node(1)]));
  await board.get();
  tick(59_000);
  await board.get();
  assert.equal(calls.length, 1);
  await board.get(true);
  assert.equal(calls.length, 2);
  tick(60_001);
  await board.get();
  assert.equal(calls.length, 3);
});

test("every team shows, whatever the teams are", async () => {
  const other = (n: number, key: string) => ({ ...node(n), team: { key, name: `Team ${key}` } });
  const { board } = setup("k", () => reply([other(1, "ENG"), other(2, "OPS"), other(3, "HR")]));
  assert.deepEqual((await board.get()).issues.map((issue) => issue.team.key), ["ENG", "OPS", "HR"]);
});

test("a refused key shows a clear error without the key", async () => {
  const { board } = setup("key-bad", () => new Response("denied key-bad", { status: 400 }));
  const result = await board.get();
  assert.match(result.error!, /^Linear refused this key/);
  assert.ok(!JSON.stringify(result).includes("key-bad"));
});

test("invalidate drops the cache", async () => {
  const { board, calls } = setup("k", () => reply([]));
  await board.get();
  board.invalidate();
  await board.get();
  assert.equal(calls.length, 2);
});
