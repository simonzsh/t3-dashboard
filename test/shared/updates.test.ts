import assert from "node:assert/strict";
import { test } from "bun:test";
import { displayVersion, isMainVersion } from "../../shared/updates.ts";

test("main versions require a full commit and display its short identity", () => {
  const main = `main-${"a".repeat(40)}`;
  assert.equal(isMainVersion(main), true);
  assert.equal(displayVersion(main), "main aaaaaaa");
  for (const value of ["main", "main-aaaaaaa", `main-${"z".repeat(40)}`, "1.2.8", "dev"]) assert.equal(isMainVersion(value), false);
  assert.equal(displayVersion("1.2.8"), "1.2.8");
});
