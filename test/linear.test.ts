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

const reply = (nodes: unknown[]) => new Response(JSON.stringify({ data: { viewer: { assignedIssues: { nodes } } } }), { status: 200 });

interface Call {
  url: string;
  authorization: string | null;
  query: string;
}

function setup(workspaces: LinearWorkspaceConfig[], respond: (key: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let clock = 1_000_000;
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), authorization: headers.get("authorization"), query: JSON.parse(String(init?.body)).query });
    return respond(headers.get("authorization") ?? "");
  };
  const board = new LinearBoard({
    fetch: fetchFn,
    readWorkspaces: () => workspaces,
    resolveProject: (title) => (title === "Project A" ? "project-1" : null),
    now: () => new Date(clock),
  });
  return { board, calls, tick: (ms: number) => (clock += ms) };
}

const space = (name: string, apiKey: string, t3Project = "Project A", teams: Record<string, string | null> | null = null, unlisted: "show" | "hide" = teams ? "hide" : "show"): LinearWorkspaceConfig => ({
  name,
  apiKey,
  t3Project,
  teams,
  unlisted,
});

test("fetches assigned issues with the raw key as Authorization and tags the workspace", async () => {
  const { board, calls } = setup([space("Space 1", "key-1")], () => reply([node(1)]));
  const result = await board.get();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.linear.app/graphql");
  assert.equal(calls[0]!.authorization, "key-1");
  assert.match(calls[0]!.query, /assignedIssues\(first: 100/);
  assert.match(calls[0]!.query, /nin: \["completed", "canceled"\]/);
  assert.deepEqual(result.workspaces, [{ name: "Space 1", ok: true, error: null, t3ProjectId: "project-1" }]);
  assert.deepEqual(result.issues, [{ ...node(1), workspace: "Space 1", t3ProjectId: "project-1" }]);
});

test("a missing key shows an error without calling Linear", async () => {
  const { board, calls } = setup([space("Space 1", "")], () => reply([]));
  const result = await board.get();
  assert.equal(calls.length, 0);
  assert.deepEqual(result.workspaces, [{ name: "Space 1", ok: false, error: "Missing API key", t3ProjectId: "project-1" }]);
  assert.equal(result.configured, false);
});

test("one failing workspace does not block the others, and the error holds no key", async () => {
  const { board } = setup([space("Space 1", "key-bad"), space("Space 2", "key-2", "Unknown")], (key) =>
    key === "key-bad" ? new Response(`denied ${key}`, { status: 401 }) : reply([node(2)]),
  );
  const result = await board.get();
  assert.equal(result.workspaces[0]!.ok, false);
  assert.match(result.workspaces[0]!.error!, /401/);
  assert.ok(!JSON.stringify(result).includes("key-bad"));
  assert.deepEqual(result.workspaces[1], { name: "Space 2", ok: true, error: null, t3ProjectId: null });
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
    resolveProject: () => null,
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

test("fetchedAt is the time of the read", async () => {
  const { board } = setup([space("Space 1", "key-1")], () => reply([]));
  assert.equal((await board.get()).fetchedAt, new Date(1_000_000).toISOString());
});

test("with a team table, only listed teams show, each with its own T3 project", async () => {
  const other = (n: number, key: string) => ({ ...node(n), team: { key, name: `Team ${key}` } });
  const { board } = setup([space("Linear", "key-1", "", { ENG: "Project A", OPS: "Unknown" })], () => reply([other(1, "ENG"), other(2, "OPS"), other(3, "HR")]));
  const result = await board.get();
  assert.deepEqual(result.issues.map((issue) => [issue.id, issue.t3ProjectId]), [["issue-1", "project-1"], ["issue-2", null]]);
  assert.deepEqual(result.workspaces, [{ name: "Linear", ok: true, error: null, t3ProjectId: null }]);
});

test("a table entry on a workspace with a t3Project keeps the workspace project in its status", async () => {
  const { board } = setup([space("Space 1", "key-1", "Project A", { TEAM: "Unknown" })], () => reply([node(1)]));
  const result = await board.get();
  assert.equal(result.workspaces[0]!.t3ProjectId, "project-1");
  assert.equal(result.issues[0]!.t3ProjectId, null);
});

test("without a table, every issue goes to the workspace project", async () => {
  const { board } = setup([space("Space 1", "key-1")], () => reply([node(1)]));
  assert.equal((await board.get()).issues[0]!.t3ProjectId, "project-1");
});

const other = (n: number, key: string) => ({ ...node(n), team: { key, name: `Team ${key}` } });
const teamsReply = () => reply([other(1, "ENG"), other(2, "OPS"), other(3, "DES"), other(4, "HR")]);
const seen = (result: Awaited<ReturnType<LinearBoard["get"]>>) => result.issues.map((issue) => [issue.team.key, issue.t3ProjectId]);

test("a null team is hidden, an empty one is shown without a project, a title resolves to its project", async () => {
  const { board } = setup([space("Linear", "k", "", { ENG: "Project A", OPS: null, DES: "" })], teamsReply);
  assert.deepEqual(seen(await board.get()), [["ENG", "project-1"], ["DES", null]]);
});

test("unlisted show keeps the teams that are not in the table, with no project", async () => {
  const { board } = setup([space("Linear", "k", "", { ENG: "Project A", OPS: null }, "show")], teamsReply);
  assert.deepEqual(seen(await board.get()), [["ENG", "project-1"], ["DES", null], ["HR", null]]);
});

test("unlisted hide drops the teams that are not in the table", async () => {
  const { board } = setup([space("Linear", "k", "", { ENG: "Project A" }, "hide")], teamsReply);
  assert.deepEqual(seen(await board.get()), [["ENG", "project-1"]]);
});

test("a key with no table at all shows every team, in the workspace project when it has one", async () => {
  const { board } = setup([space("Linear", "k", "Project A", null, "show")], teamsReply);
  assert.deepEqual(seen(await board.get()).map(([, project]) => project), ["project-1", "project-1", "project-1", "project-1"]);
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

test("listTeams returns key and name only, and maps failures", async () => {
  const { board, calls } = setup([], (key) =>
    key === "good" ? new Response(JSON.stringify({ data: { teams: { nodes: [{ key: "ENG", name: "Engineering", id: "x" }] } } })) : new Response("no", { status: 401 }),
  );
  assert.deepEqual(await board.listTeams("good"), { teams: [{ key: "ENG", name: "Engineering" }] });
  assert.match(calls[0]!.query, /teams\(first: 250\)/);
  assert.equal(await board.listTeams("bad"), "refused");
});
