import assert from "node:assert/strict";
import { test } from "bun:test";
import { readRearmed, rearmedText } from "../../src/config/rearmedFile.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/rearmed-reminders.json";

test("reads the marks and keeps string values only", () => {
  assert.deepEqual(readRearmed(FILE, files({ [FILE]: JSON.stringify({ a: "t1", b: 3 }) })), { a: "t1" });
  assert.deepEqual(readRearmed(FILE, files({ [FILE]: rearmedText({ a: "t1" }) })), { a: "t1" });
});

test("a missing file, invalid JSON or a wrong shape gives no marks", () => {
  for (const read of [files({}), files({ [FILE]: "{oops" }), files({ [FILE]: "null" }), files({ [FILE]: "[]" })]) assert.deepEqual(readRearmed(FILE, read), {});
});
