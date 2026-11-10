import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("creating or assigning a session prevents the dialog from refocusing the old session", () => {
  const source = readFileSync(new URL("../../../src/features/new-thread/NewThreadDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /const completed = useRef\(false\)/);
  assert.match(source, /completed\.current = true;\s*onCreated\(threadId\)/);
  assert.match(source, /restoreFocus=\{\(\) => !completed\.current\}/);
  assert.equal(source.match(/finish\(threadId\)/g)?.length, 2);
  assert.equal(source.match(/onCreated\(threadId\)/g)?.length, 1);
});
