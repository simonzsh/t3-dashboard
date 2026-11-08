import { test } from "bun:test";
import assert from "node:assert/strict";
import type { PrDetail, PrDiff, PrRef } from "../../../../shared/pulls.ts";
import { MAX_PAGES, cachedPage, diffFollowUp, diffHint, rememberPage, resetPages } from "../../../src/features/pulls/prCache.ts";

const ref = (n: number): PrRef => ({ repository: "acme/api", number: n });
const detail = (headSha: string) => ({ headSha }) as PrDetail;
const diff = (headSha: string) => ({ headSha }) as PrDiff;

test("the cache keeps the latest pages and a read counts as use", () => {
  resetPages();
  for (let n = 1; n <= MAX_PAGES; n++) rememberPage(ref(n), { detail: detail(`s${n}`) });
  assert.ok(cachedPage(ref(1)));
  rememberPage(ref(100), { detail: detail("new") });
  assert.equal(cachedPage(ref(2)), undefined);
  assert.ok(cachedPage(ref(1)));
  assert.ok(cachedPage(ref(100)));
});

test("remembering one part keeps the other", () => {
  resetPages();
  rememberPage(ref(1), { detail: detail("a") });
  rememberPage(ref(1), { diff: diff("b") });
  assert.equal(cachedPage(ref(1))?.detail?.headSha, "a");
  assert.equal(cachedPage(ref(1))?.diff?.headSha, "b");
});

test("the diff hint prefers the cached diff, then the cached detail, then the list", () => {
  const page = { detail: detail("d"), diff: diff("f") };
  assert.equal(diffHint(page, { headSha: "l" }), "f");
  assert.equal(diffHint({ detail: detail("d"), diff: null }, { headSha: "l" }), "d");
  assert.equal(diffHint(undefined, { headSha: "l" }), "l");
  assert.equal(diffHint(undefined, { headSha: "" }), undefined);
  assert.equal(diffHint(undefined), undefined);
});

test("a follow-up diff read happens only when the hint was served and the head moved", () => {
  assert.equal(diffFollowUp("a", detail("b"), diff("a")), "b");
  assert.equal(diffFollowUp("a", detail("a"), diff("a")), null);
  assert.equal(diffFollowUp("a", detail("b"), diff("b")), null);
  assert.equal(diffFollowUp(undefined, detail("b"), diff("a")), null);
  assert.equal(diffFollowUp("a", null, diff("a")), null);
  assert.equal(diffFollowUp("a", detail("b"), null), null);
});
