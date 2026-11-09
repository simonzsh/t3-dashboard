import assert from "node:assert/strict";
import { test } from "bun:test";
import { DomainError } from "../../src/domain/errors.ts";
import { PullRequests } from "../../src/domain/pulls.ts";
import type { GhRun } from "../../src/integrations/github/gh.ts";

const DIFF = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n one\n+two\n";

function setup() {
  let clock = 1_000_000;
  let sha = "sha1";
  let gate: Promise<void> | null = null;
  let failList = false;
  const calls: string[] = [];
  const run: GhRun = async (args) => {
    calls.push(args.slice(0, 2).join(" "));
    if (args[0] === "api" && gate) await gate;
    if (args[0] === "api" && failList) return { code: 1, stdout: "", truncated: false };
    if (args[0] === "api") return { code: 0, stdout: JSON.stringify({ data: { search: { nodes: [] } } }), truncated: false };
    if (args[1] === "diff") return { code: 0, stdout: DIFF, truncated: false };
    return { code: 0, stdout: JSON.stringify({ url: "https://example.test/p", headRefOid: sha, state: "OPEN" }), truncated: false };
  };
  const review = new PullRequests({ run, now: () => new Date(clock) });
  return {
    review,
    calls,
    tick: (ms: number) => (clock += ms),
    setSha: (next: string) => (sha = next),
    fail: (on: boolean) => (failList = on),
    // The next list reads wait until `open()` is called.
    hold: () => {
      let open!: () => void;
      gate = new Promise<void>((resolve) => (open = resolve));
      return open;
    },
  };
}

const settle = () => Bun.sleep(0);

test("the list is fresh for 25 seconds, served stale up to 10 minutes while a read runs, then awaited", async () => {
  const { review, calls, tick } = setup();
  const first = await review.prs();
  assert.equal(calls.length, 2);
  assert.equal(first.fetchedAt, "1970-01-01T00:16:40.000Z");
  tick(24_000);
  assert.equal((await review.prs()).stale, undefined);
  assert.equal(calls.length, 2);
  await review.prs(true);
  assert.equal(calls.length, 4);
  tick(26_000);
  const stale = await review.prs();
  assert.equal(stale.stale, true);
  // The list read by `prs(true)` at 24 s is the one served.
  assert.equal(stale.fetchedAt, new Date(1_024_000).toISOString());
  await settle();
  assert.equal(calls.length, 6);
  const next = await review.prs();
  assert.equal(next.stale, undefined);
  assert.equal(calls.length, 6);
  tick(601_000);
  const waited = await review.prs();
  assert.equal(waited.stale, undefined);
  assert.equal(calls.length, 8);
});

test("a reader during a background read waits for it and gets the new list", async () => {
  const { review, calls, tick, hold } = setup();
  await review.prs();
  tick(26_000);
  const open = hold();
  const stale = await review.prs();
  assert.equal(stale.stale, true);
  let answer: Awaited<ReturnType<typeof review.prs>> | null = null;
  const reader = review.prs().then((value) => (answer = value));
  await settle();
  assert.equal(answer, null);
  open();
  await reader;
  assert.equal(answer!.stale, undefined);
  assert.equal(answer!.fetchedAt, new Date(1_026_000).toISOString());
  assert.equal(calls.length, 4);
});

test("a failed background read keeps the old list and raises no unhandled rejection", async () => {
  const { review, calls, tick, fail } = setup();
  const first = await review.prs();
  tick(26_000);
  fail(true);
  assert.equal((await review.prs()).fetchedAt, first.fetchedAt);
  await settle();
  assert.equal(calls.length, 4);
  const again = await review.prs();
  assert.equal(again.stale, true);
  assert.equal(again.fetchedAt, first.fetchedAt);
  await settle();
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

test("a diff is parsed once per head commit, and a push right away shows the new diff", async () => {
  const { review, calls, tick, setSha } = setup();
  const first = await review.diff("acme/api", 1);
  assert.equal(first.headSha, "sha1");
  assert.equal(first.files[0]!.path, "a.ts");
  assert.equal(first.files[0]!.additions, 1);
  assert.deepEqual(calls, ["pr view", "pr diff"]);
  // Same head: only the SHA is read again, the parsed diff is reused.
  await review.diff("acme/api", 1);
  assert.deepEqual(calls, ["pr view", "pr diff", "pr view"]);
  // A push inside the 60 s detail cache: the old diff must not show.
  setSha("sha2");
  tick(1_000);
  const next = await review.diff("acme/api", 1);
  assert.equal(next.headSha, "sha2");
  assert.deepEqual(calls, ["pr view", "pr diff", "pr view", "pr view", "pr diff"]);
  assert.equal((await review.detail("acme/api", 1)).headSha, "sha2");
});

test("a diff asked with a known head SHA costs no gh call", async () => {
  const { review, calls } = setup();
  await review.diff("acme/api", 1);
  calls.length = 0;
  const known = await review.diff("acme/api", 1, { sha: "sha1" });
  assert.equal(known.headSha, "sha1");
  assert.equal(known.files[0]!.path, "a.ts");
  assert.deepEqual(calls, []);
});

test("an unknown SHA reads the head and answers the real head", async () => {
  const { review, calls } = setup();
  const diff = await review.diff("acme/api", 1, { sha: "old" });
  assert.equal(diff.headSha, "sha1");
  assert.deepEqual(calls, ["pr view", "pr diff"]);
});

test("refresh with a known SHA reads the head again", async () => {
  const { review, calls, setSha } = setup();
  await review.diff("acme/api", 1);
  calls.length = 0;
  assert.equal((await review.diff("acme/api", 1, { sha: "sha1", refresh: true })).headSha, "sha1");
  assert.deepEqual(calls, ["pr view"]);
  setSha("sha2");
  assert.equal((await review.diff("acme/api", 1, { sha: "sha1", refresh: true })).headSha, "sha2");
});

test("the detail and the diff opened together share one pr view", async () => {
  const { review, calls } = setup();
  await Promise.all([review.detail("acme/api", 1), review.diff("acme/api", 1)]);
  assert.deepEqual(calls, ["pr view", "pr diff"]);
  calls.length = 0;
  await Promise.all([review.detail("acme/api", 1, true), review.diff("acme/api", 1)]);
  assert.deepEqual(calls, ["pr view"]);
});

test("an unknown pull request is not-found, not a GitHub failure", async () => {
  const run: GhRun = async () => ({ code: 1, stdout: "", truncated: false, notFound: true });
  const review = new PullRequests({ run, now: () => new Date(0) });
  for (const read of [() => review.detail("acme/api", 9), () => review.diff("acme/api", 9), () => review.diff("acme/api", 9, { sha: "x" })]) {
    await assert.rejects(read, (error: unknown) => error instanceof DomainError && error.code === "not-found");
  }
});
