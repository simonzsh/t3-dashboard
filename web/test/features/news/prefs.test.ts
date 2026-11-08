import { test } from "bun:test";
import assert from "node:assert/strict";
import { loadNewsListHidden, NEWS_LIST_KEY, saveNewsListHidden } from "../../../src/features/news/prefs.ts";
import { memoryStore } from "../../fixtures.ts";

test("the hidden News list is saved and read back, shown by default", () => {
  const store = memoryStore();
  assert.equal(loadNewsListHidden(store), false);
  saveNewsListHidden(store, true);
  assert.equal(store.data.get(NEWS_LIST_KEY), "hidden");
  assert.equal(loadNewsListHidden(store), true);
  saveNewsListHidden(store, false);
  assert.equal(loadNewsListHidden(store), false);
});
