import assert from "node:assert/strict";
import { test } from "bun:test";
import { t3CodeLink } from "../src/t3Link.ts";

test("t3CodeLink builds the T3 Code deep link with encoded ids", () => {
  assert.equal(t3CodeLink("env-1", "thread-1"), "t3code://threads/env-1/thread-1");
  assert.equal(t3CodeLink("env 1", "a/b"), "t3code://threads/env%201/a%2Fb");
});

test("t3CodeLink gives null without an environment id", () => {
  assert.equal(t3CodeLink(null, "thread-1"), null);
});
