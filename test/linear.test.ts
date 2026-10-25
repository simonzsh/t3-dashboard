import assert from "node:assert/strict";
import { test } from "bun:test";
import { LinearBoard } from "../src/linear.ts";
import type { LinearWorkspaceConfig } from "../src/linearConfig.ts";

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

function setup(workspaces: LinearWorkspaceConfig[], respond: (key: string, variables: Call["variables"]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let clock = 1_000_000;
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), authorization: headers.get("authorization"), query: body.query, variables: body.variables });
    return respond(headers.get("authorization") ?? "", body.variables);
  };
  const board = new LinearBoard({
    fetch: fetchFn,
    readWorkspaces: () => workspaces,
    now: () => new Date(clock),
  });
  return { board, calls, tick: (ms: number) => (clock += ms) };
}

const space = (name: string, apiKey: string): LinearWorkspaceConfig => ({ name, apiKey });

test("fetches assigned issues with the raw key as Authorization and tags the workspace", async () => {
  const { board, calls } = setup([space("Space 1", "key-1")], () => reply([node(1)]));
  const result = await board.get();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.linear.app/graphql");
  assert.equal(calls[0]!.authorization, "key-1");
  assert.match(calls[0]!.query, /assignedIssues\(first: 100, after: \$after/);
  assert.match(calls[0]!.query, /nin: \["completed", "canceled"\]/);
  assert.deepEqual(result.workspaces, [{ name: "Space 1", ok: true, error: null }]);
  assert.deepEqual(result.issues, [{ ...node(1), workspace: "Space 1" }]);
});

test("follows pageInfo until the last page and keeps every issue in order", async () => {
  const { board, calls } = setup([space("Space 1", "key-1")], (_key, variables) => {
    if (variables?.after === undefined) return reply([node(1), node(2)], { hasNextPage: true, endCursor: "c1" });
    if (variables.after === "c1") return reply([node(3)], { hasNextPage: true, endCursor: "c2" });
    return reply([node(4)]);
  });
  const result = await board.get();
  assert.deepEqual(result.issues.map((issue) => issue.identifier), ["TEAM-1", "TEAM-2", "TEAM-3", "TEAM-4"]);
  assert.deepEqual(calls.map((call) => call.variables?.after), [undefined, "c1", "c2"]);
  assert.match(calls[0]!.query, /pageInfo \{ hasNextPage endCursor \}/);
  assert.deepEqual(result.workspaces, [{ name: "Space 1", ok: true, error: null }]);
});

test("a board with endless pages fails loudly instead of truncating", async () => {
  const { board, calls } = setup([space("Space 1", "key-1")], () => reply([node(1)], { hasNextPage: true, endCursor: "next" }));
  const result = await board.get();
  assert.equal(calls.length, 20);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.workspaces, [{ name: "Space 1", ok: false, error: "Too many assigned issues to load (over 2000)" }]);
});

test("a next page without a cursor is an error", async () => {
  const { board } = setup([space("Space 1", "key-1")], () => reply([node(1)], { hasNextPage: true, endCursor: null }));
  assert.equal((await board.get()).workspaces[0]!.ok, false);
});

test("a missing key shows an error without calling Linear", async () => {
  const { board, calls } = setup([space("Space 1", "")], () => reply([]));
  const result = await board.get();
  assert.equal(calls.length, 0);
  assert.deepEqual(result.workspaces, [{ name: "Space 1", ok: false, error: "Missing API key" }]);
  assert.equal(result.configured, false);
});

test("one failing workspace does not block the others, and the error holds no key", async () => {
  const { board } = setup([space("Space 1", "key-bad"), space("Space 2", "key-2")], (key) =>
    key === "key-bad" ? new Response(`denied ${key}`, { status: 401 }) : reply([node(2)]),
  );
  const result = await board.get();
  assert.equal(result.workspaces[0]!.ok, false);
  assert.match(result.workspaces[0]!.error!, /401/);
  assert.ok(!JSON.stringify(result).includes("key-bad"));
  assert.deepEqual(result.workspaces[1], { name: "Space 2", ok: true, error: null });
  assert.deepEqual(result.issues.map((issue) => issue.workspace), ["Space 2"]);
});

test("GraphQL errors and network failures become a workspace error", async () => {
  const graphql = setup([space("Space 1", "key-1")], () => new Response(JSON.stringify({ errors: [{ message: "bad key-1" }] }), { status: 200 }));
  const first = await graphql.board.get();
  assert.equal(first.workspaces[0]!.ok, false);
  assert.ok(!JSON.stringify(first).includes("key-1"));
  const network = new LinearBoard({
    fetch: async () => {
      throw new Error("connect failed for key-1");
    },
    readWorkspaces: () => [space("Space 1", "key-1")],
    now: () => new Date(),
  });
  const second = await network.get();
  assert.equal(second.workspaces[0]!.ok, false);
  assert.ok(!JSON.stringify(second).includes("key-1"));
});

test("caches for 60 seconds and refresh forces a new read", async () => {
  const { board, calls, tick } = setup([space("Space 1", "key-1")], () => reply([node(1)]));
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
  const { board } = setup([space("Linear", "k")], () => reply([other(1, "ENG"), other(2, "OPS"), other(3, "HR")]));
  assert.deepEqual((await board.get()).issues.map((issue) => issue.team.key), ["ENG", "OPS", "HR"]);
});

test("the board is configured as soon as one workspace has a key", async () => {
  const { board } = setup([space("A", ""), space("B", "key-b")], () => reply([]));
  assert.equal((await board.get()).configured, true);
  assert.equal((await setup([], () => reply([])).board.get()).configured, false);
});

test("a refused key shows a clear error without the key", async () => {
  const { board } = setup([space("A", "key-bad")], () => new Response("denied key-bad", { status: 400 }));
  const result = await board.get();
  assert.match(result.workspaces[0]!.error!, /^Linear refused this key/);
  assert.ok(!JSON.stringify(result).includes("key-bad"));
});

test("invalidate drops the cache", async () => {
  const { board, calls } = setup([space("A", "k")], () => reply([]));
  await board.get();
  board.invalidate();
  await board.get();
  assert.equal(calls.length, 2);
});

test("verifyKey asks Linear for the viewer and tells ok, refused or unreachable", async () => {
  const { board, calls } = setup([], (key) => {
    if (key === "good") return new Response(JSON.stringify({ data: { viewer: { id: "u1" } } }));
    if (key === "bad") return new Response("no", { status: 401 });
    if (key === "down") return new Response("oops", { status: 503 });
    throw new Error(`network ${key}`);
  });
  assert.equal(await board.verifyKey("good"), "ok");
  assert.equal(calls[0]!.query, "{ viewer { id } }");
  assert.equal(calls[0]!.authorization, "good");
  assert.equal(await board.verifyKey("bad"), "refused");
  assert.equal(await board.verifyKey("down"), "unreachable");
  assert.equal(await board.verifyKey("offline"), "unreachable");
});
