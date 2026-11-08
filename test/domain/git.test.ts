import assert from "node:assert/strict";
import { test } from "bun:test";
import { GitReview } from "../../src/domain/git.ts";
import type { GhRun } from "../../src/integrations/github/gh.ts";

const DIFF = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n one\n+two\n";

function setup() {
  let clock = 1_000_000;
  let sha = "sha1";
  const calls: string[] = [];
  const run: GhRun = async (args) => {
    calls.push(args.slice(0, 2).join(" "));
    if (args[0] === "api") return { code: 0, stdout: JSON.stringify({ data: { search: { nodes: [] } } }), truncated: false };
    if (args[1] === "diff") return { code: 0, stdout: DIFF, truncated: false };
    return { code: 0, stdout: JSON.stringify({ url: "https://example.test/p", headRefOid: sha, state: "OPEN" }), truncated: false };
  };
  const review = new GitReview({ run, now: () => new Date(clock) });
  return { review, calls, tick: (ms: number) => (clock += ms), setSha: (next: string) => (sha = next) };
}

test("the list is cached for 60 seconds and refresh reads again", async () => {
  const { review, calls, tick } = setup();
  const first = await review.prs();
  assert.equal(calls.length, 2);
  assert.equal(first.fetchedAt, "1970-01-01T00:16:40.000Z");
  tick(59_000);
  await review.prs();
  assert.equal(calls.length, 2);
  await review.prs(true);
  assert.equal(calls.length, 4);
  tick(61_000);
  await review.prs();
  assert.equal(calls.length, 6);
});

test("two readers at once share the same gh calls", async () => {
  const { review, calls } = setup();
  await Promise.all([review.prs(), review.prs(true)]);
  assert.equal(calls.length, 2);
});

test("a detail is cached per pull request for 60 seconds", async () => {
  const { review, calls, tick } = setup();
  await review.detail("acme/api", 1);
  await review.detail("acme/api", 1);
  assert.equal(calls.length, 1);
  await review.detail("acme/api", 2);
  assert.equal(calls.length, 2);
  tick(61_000);
  await review.detail("acme/api", 1);
  assert.equal(calls.length, 3);
});

test("a diff is parsed once per head commit", async () => {
  const { review, calls, tick, setSha } = setup();
  const first = await review.diff("acme/api", 1);
  assert.equal(first.headSha, "sha1");
  assert.equal(first.files[0]!.path, "a.ts");
  assert.equal(first.files[0]!.additions, 1);
  assert.deepEqual(calls, ["pr view", "pr diff"]);
  tick(30_000);
  await review.diff("acme/api", 1);
  assert.deepEqual(calls, ["pr view", "pr diff"]);
  // The head moved: the detail expires, and the new SHA asks for a new diff.
  setSha("sha2");
  tick(31_000);
  const next = await review.diff("acme/api", 1);
  assert.equal(next.headSha, "sha2");
  assert.deepEqual(calls, ["pr view", "pr diff", "pr view", "pr diff"]);
});
