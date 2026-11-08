import assert from "node:assert/strict";
import { test } from "bun:test";
import { isTestFile } from "../../../src/features/pulls/testFiles.ts";

test("test files are found by folder, by name and by snapshot suffix", () => {
  for (const path of ["web/test/a.ts", "src/__tests__/a.ts", "spec/helper.rb", "a/b/foo.test.ts", "foo.spec.tsx", "x/__snapshots__/y.snap", "a.snap", "pkg/handler_test.go", "tests/test_api.py", "test_api.py", "pkg/api_test.py"]) {
    assert.equal(isTestFile(path), true, path);
  }
});

test("lockfiles, build output and look-alikes are not test files", () => {
  for (const path of ["bun.lock", "package-lock.json", "dist/app.js", "src/contest/a.ts", "src/latest.ts", "src/testing.ts", "src/test.ts", "docs/spec-notes.md", "src/a.test"]) {
    assert.equal(isTestFile(path), false, path);
  }
});
