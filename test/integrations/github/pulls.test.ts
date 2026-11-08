import assert from "node:assert/strict";
import { test } from "bun:test";
import { IntegrationError } from "../../../src/integrations/errors.ts";
import type { GhResult, GhRun } from "../../../src/integrations/github/gh.ts";
import { getDiff, getPull, listPulls, MAX_DIFF_BYTES } from "../../../src/integrations/github/pulls.ts";

const ok = (stdout: string, truncated = false): GhResult => ({ code: 0, stdout, truncated });
const fake = (answer: (args: string[]) => GhResult) => {
  const calls: string[][] = [];
  const run: GhRun = async (args, options) => (calls.push(options?.maxBytes ? [...args, `maxBytes=${options.maxBytes}`] : args), answer(args));
  return { run, calls };
};

const node = (number: number, repository: string, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Change ${number}`,
  url: `https://example.test/${repository}/pull/${number}`,
  isDraft: false,
  headRefName: `feature-${number}`,
  baseRefName: "main",
  createdAt: `2025-12-0${number}T10:00:00Z`,
  updatedAt: `2026-01-0${number}T10:00:00Z`,
  additions: 10,
  deletions: 2,
  reviewDecision: "APPROVED",
  author: { login: "ada" },
  repository: { nameWithOwner: repository },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
  ...extra,
});
const search = (...nodes: unknown[]) => ok(JSON.stringify({ data: { search: { nodes } } }));

test("listPulls runs one search per scope and merges a PR found in both", async () => {
  const { run, calls } = fake((args) =>
    args.some((a) => a.includes("author:@me")) ? search(node(1, "acme/storefront"), node(3, "acme/api", { isDraft: true, reviewDecision: "CHANGES_REQUESTED" })) : search(node(2, "acme/api"), node(1, "acme/storefront")),
  );
  const prs = await listPulls(run);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((args) => args[0] === "api" && args[1] === "graphql"));
  assert.ok(calls[0]!.includes("q=is:pr is:open author:@me archived:false"));
  assert.ok(calls[1]!.includes("q=is:pr is:open review-requested:@me archived:false"));
  assert.deepEqual(prs.map((pr) => `${pr.repository}#${pr.number}`), ["acme/api#3", "acme/api#2", "acme/storefront#1"]);
  assert.deepEqual(prs.find((pr) => pr.number === 1)!.roles, ["author", "reviewer"]);
  assert.deepEqual(prs.find((pr) => pr.number === 2)!.roles, ["reviewer"]);
  const draft = prs.find((pr) => pr.number === 3)!;
  assert.equal(draft.draft, true);
  assert.equal(draft.review, "changes_requested");
  assert.equal(draft.headRef, "feature-3");
  assert.equal(draft.createdAt, "2025-12-03T10:00:00Z");
  assert.ok(calls[0]!.some((arg) => /\bcreatedAt\b/.test(arg)));
});

test("a node without createdAt maps to an empty string", async () => {
  const { run } = fake(() => search(node(1, "acme/api", { createdAt: null })));
  assert.equal((await listPulls(run))[0]!.createdAt, "");
});

test("the list reads the head commit of each pull request", async () => {
  const { run, calls } = fake(() => search(node(1, "acme/api", { headRefOid: "h1" }), node(2, "acme/api")));
  const prs = await listPulls(run);
  assert.equal(prs.find((pr) => pr.number === 1)!.headSha, "h1");
  assert.equal(prs.find((pr) => pr.number === 2)!.headSha, "");
  assert.ok(calls[0]!.some((arg) => /\bheadRefOid\b/.test(arg)));
});

test("listPulls maps the check rollup and skips nodes that are not usable pull requests", async () => {
  const rollup = (state: string | null) => ({ commits: { nodes: [{ commit: { statusCheckRollup: state === null ? null : { state } } }] } });
  const { run } = fake(() => search(node(1, "acme/api", rollup("FAILURE")), node(2, "acme/api", rollup("PENDING")), node(3, "acme/api", rollup(null)), {}, null, node(4, "-evil/api")));
  const prs = await listPulls(run);
  assert.deepEqual(prs.map((pr) => pr.checks).sort(), ["failure", "none", "pending"]);
  assert.equal(prs.length, 3);
});

test("getPull maps the view, the check runs and the review decision", async () => {
  const view = {
    number: 7,
    title: "Add cart",
    url: "https://example.test/acme/storefront/pull/7",
    author: { login: "ada" },
    isDraft: false,
    state: "OPEN",
    headRefName: "cart",
    baseRefName: "main",
    headRefOid: "abc123",
    createdAt: "2026-01-02T08:00:00Z",
    updatedAt: "2026-01-05T10:00:00Z",
    additions: 5,
    deletions: 1,
    changedFiles: 2,
    body: "Adds a cart.",
    reviewDecision: "",
    reviews: [{ author: { login: "grace" }, state: "COMMENTED", submittedAt: "2026-01-05T11:00:00Z" }],
    statusCheckRollup: [
      { __typename: "CheckRun", name: "build", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://example.test/run/1" },
      { __typename: "CheckRun", name: "lint", status: "IN_PROGRESS", conclusion: "" },
      { __typename: "CheckRun", name: "docs", status: "COMPLETED", conclusion: "SKIPPED" },
      { __typename: "StatusContext", context: "deploy", state: "FAILURE", targetUrl: "https://example.test/deploy" },
    ],
  };
  const { run, calls } = fake(() => ok(JSON.stringify(view)));
  const pr = await getPull(run, "acme/storefront", 7);
  assert.deepEqual(calls[0]!.slice(0, 5), ["pr", "view", "7", "-R", "acme/storefront"]);
  assert.equal(pr.headSha, "abc123");
  assert.equal(pr.createdAt, "2026-01-02T08:00:00Z");
  assert.ok(calls[0]!.at(-1)!.split(",").includes("createdAt"));
  assert.equal(pr.state, "open");
  assert.equal(pr.review, "none");
  assert.equal(pr.checks, "failure");
  assert.deepEqual(pr.checkRuns.map((c) => [c.name, c.state, c.url]), [
    ["build", "success", "https://example.test/run/1"],
    ["lint", "pending", null],
    ["docs", "skipped", null],
    ["deploy", "failure", "https://example.test/deploy"],
  ]);
  assert.deepEqual(pr.reviews, [{ author: "grace", state: "COMMENTED", submittedAt: "2026-01-05T11:00:00Z" }]);
  assert.equal(pr.changedFiles, 2);
});

test("getPull maps merged and closed states", async () => {
  const base = { url: "https://example.test/p", headRefOid: "abc" };
  assert.equal((await getPull(fake(() => ok(JSON.stringify({ ...base, state: "MERGED" }))).run, "acme/api", 1)).state, "merged");
  assert.equal((await getPull(fake(() => ok(JSON.stringify({ ...base, state: "CLOSED" }))).run, "acme/api", 1)).state, "closed");
  assert.equal((await getPull(fake(() => ok(JSON.stringify(base))).run, "acme/api", 1)).createdAt, "");
});

test("getDiff asks for a capped plain diff and passes the truncation flag on", async () => {
  const { run, calls } = fake(() => ok("diff --git a/x b/x\n", true));
  assert.deepEqual(await getDiff(run, "acme/api", 12), { text: "diff --git a/x b/x\n", truncated: true });
  assert.deepEqual(calls[0], ["pr", "diff", "12", "-R", "acme/api", "--color=never", `maxBytes=${MAX_DIFF_BYTES}`]);
});

test("a bad reference never reaches gh", async () => {
  const { run, calls } = fake(() => ok("{}"));
  await assert.rejects(getPull(run, "--repo=evil", 1));
  await assert.rejects(getPull(run, "acme/api", 0));
  await assert.rejects(getDiff(run, "acme/api/extra", 1));
  assert.equal(calls.length, 0);
});

test("gh failures become integration errors with fixed messages", async () => {
  const fail = (code: number | null, stdout = "secret-token") => fake(() => ({ code, stdout, truncated: false })).run;
  const kind = async (run: GhRun) => {
    try {
      await getPull(run, "acme/api", 1);
    } catch (error) {
      assert.ok(error instanceof IntegrationError);
      assert.equal(error.system, "github");
      assert.ok(!error.message.includes("secret-token"));
      return error.kind;
    }
    return "none";
  };
  assert.equal(await kind(fail(4)), "not-authenticated");
  assert.equal(await kind(fail(null)), "unreachable");
  assert.equal(await kind(fail(1)), "refused");
  assert.equal(await kind(fail(0, "not json")), "protocol");
  assert.equal(await kind(fail(0, "[]")), "protocol");
});
