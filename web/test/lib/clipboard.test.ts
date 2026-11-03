import { test } from "bun:test";
import assert from "node:assert/strict";
import { copyText } from "../../src/lib/clipboard.ts";

test("copyText writes through the async clipboard when there is one", async () => {
  const written: string[] = [];
  await copyText("**hi**", { clipboard: { writeText: async (text) => void written.push(text) }, execCopy: () => assert.fail("no fallback") });
  assert.deepEqual(written, ["**hi**"]);
});

test("copyText falls back to the legacy copy where the clipboard API is missing (plain http)", async () => {
  const copied: string[] = [];
  await copyText("a\nb", { clipboard: undefined, execCopy: (text) => (copied.push(text), true) });
  assert.deepEqual(copied, ["a\nb"]);
});

test("copyText falls back when the clipboard API refuses, and throws when both fail", async () => {
  const refusing = { writeText: async () => Promise.reject(new Error("denied")) };
  await copyText("x", { clipboard: refusing, execCopy: () => true });
  await assert.rejects(copyText("x", { clipboard: refusing, execCopy: () => false }), /copy/i);
});
