import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dialog focus restoration checks the latest close policy on unmount", () => {
  const source = readFileSync(new URL("../../src/ui/Dialog.tsx", import.meta.url), "utf8");
  assert.match(source, /canRestoreFocus\.current = restoreFocus/);
  assert.match(source, /return \(\) => \{\s*if \(canRestoreFocus\.current\?\.\(\) !== false\) previous\.current\?\.focus\?\.\(\);\s*\}/);
});
