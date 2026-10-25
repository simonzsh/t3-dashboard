import assert from "node:assert/strict";
import { test } from "bun:test";
import { IntegrationError } from "../../../src/integrations/errors.ts";
import { LinearClient } from "../../../src/integrations/linear/client.ts";
import { linearNode, linearPage } from "../../helpers/linear.ts";

interface Call {
  url: string;
  authorization: string | null;
  query: string;
  variables: Record<string, unknown> | undefined;
}

function setup(respond: (key: string, variables: Call["variables"]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const client = new LinearClient(async (url, init) => {
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body));
    calls.push({ url: String(url), authorization: headers.get("authorization"), query: body.query, variables: body.variables });
    return respond(headers.get("authorization") ?? "", body.variables);
  });
  return { client, calls };
}

const failure = (promise: Promise<unknown>) => promise.then(() => assert.fail("should fail"), (error: unknown) => error as IntegrationError);

test("assignedIssues posts the query with the raw key as Authorization", async () => {
  const { client, calls } = setup(() => linearPage([linearNode(1)]));
  assert.deepEqual(await client.assignedIssues("key-1"), [linearNode(1)]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.linear.app/graphql");
  assert.equal(calls[0]!.authorization, "key-1");
  assert.match(calls[0]!.query, /assignedIssues\(first: 100, after: \$after/);
  assert.match(calls[0]!.query, /nin: \["completed", "canceled"\]/);
});

test("follows pageInfo until the last page and keeps every issue in order", async () => {
  const { client, calls } = setup((_key, variables) => {
    if (variables?.after === undefined) return linearPage([linearNode(1), linearNode(2)], { hasNextPage: true, endCursor: "c1" });
    if (variables.after === "c1") return linearPage([linearNode(3)], { hasNextPage: true, endCursor: "c2" });
    return linearPage([linearNode(4)]);
  });
  const issues = await client.assignedIssues("key-1");
  assert.deepEqual(issues.map((issue) => issue.identifier), ["TEAM-1", "TEAM-2", "TEAM-3", "TEAM-4"]);
  assert.deepEqual(calls.map((call) => call.variables?.after), [undefined, "c1", "c2"]);
  assert.match(calls[0]!.query, /pageInfo \{ hasNextPage endCursor \}/);
});

test("each page has its own timeout, and an abort of the whole load stops every page", async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const client = new LinearClient(async (_url, init) => {
    signals.push(init.signal);
    return signals.length === 1 ? linearPage([linearNode(1)], { hasNextPage: true, endCursor: "c1" }) : linearPage([linearNode(2)]);
  });
  await client.assignedIssues("key-1");
  assert.equal(signals.length, 2);
  assert.ok(signals[0] instanceof AbortSignal && signals[1] instanceof AbortSignal);
  assert.notEqual(signals[0], signals[1]);
});

test("endless pages fail loudly instead of truncating", async () => {
  const { client, calls } = setup(() => linearPage([linearNode(1)], { hasNextPage: true, endCursor: "next" }));
  const error = await failure(client.assignedIssues("key-1"));
  assert.equal(calls.length, 20);
  assert.equal(error.message, "Too many assigned issues to load (over 2000)");
});

test("a next page without a cursor is a protocol error that names the field", async () => {
  const { client } = setup(() => linearPage([linearNode(1)], { hasNextPage: true, endCursor: null }));
  const error = await failure(client.assignedIssues("key-1"));
  assert.ok(error instanceof IntegrationError);
  assert.deepEqual([error.system, error.kind], ["linear", "protocol"]);
  assert.match(error.message, /viewer\.assignedIssues\.pageInfo\.endCursor/);
});

test("an issue of the wrong shape names the field and never quotes the response", async () => {
  const { client } = setup(() => linearPage([linearNode(1), { ...linearNode(2), title: 42, url: "https://private.example" }]));
  const error = await failure(client.assignedIssues("key-1"));
  assert.equal(error.kind, "protocol");
  assert.equal(error.message, "Unexpected Linear issues: viewer.assignedIssues.nodes[1].title should be string, got number");
});

test("refused statuses, GraphQL errors and network failures become IntegrationErrors without the key", async () => {
  const cases: Array<[string, () => Response, string, RegExp]> = [
    ["400", () => new Response("denied key-x", { status: 400 }), "refused", /^Linear refused this key \(HTTP 400\)$/],
    ["401", () => new Response("denied key-x", { status: 401 }), "refused", /401/],
    ["503", () => new Response("oops", { status: 503 }), "unreachable", /^Linear answered HTTP 503$/],
    ["graphql", () => Response.json({ errors: [{ message: "bad key-x" }] }), "refused", /^Linear returned an error$/],
    ["network", () => {
      throw new Error("connect failed for key-x");
    }, "unreachable", /^Linear is unreachable$/],
  ];
  for (const [name, respond, kind, message] of cases) {
    const error = await failure(setup(respond).client.assignedIssues("key-x"));
    assert.ok(error instanceof IntegrationError, name);
    assert.equal(error.kind, kind, name);
    assert.match(error.message, message, name);
    assert.ok(!error.message.includes("key-x"), name);
  }
});

test("verifyKey asks Linear for the viewer and tells ok, refused or unreachable", async () => {
  const { client, calls } = setup((key) => {
    if (key === "good") return new Response(JSON.stringify({ data: { viewer: { id: "u1" } } }));
    if (key === "bad") return new Response("no", { status: 401 });
    if (key === "down") return new Response("oops", { status: 503 });
    if (key === "odd") return Response.json({ data: { viewer: null } });
    throw new Error(`network ${key}`);
  });
  assert.equal(await client.verifyKey("good"), "ok");
  assert.equal(calls[0]!.query, "{ viewer { id } }");
  assert.equal(calls[0]!.authorization, "good");
  assert.equal(await client.verifyKey("bad"), "refused");
  assert.equal(await client.verifyKey("down"), "unreachable");
  assert.equal(await client.verifyKey("offline"), "unreachable");
  assert.equal(await client.verifyKey("odd"), "unreachable");
});
