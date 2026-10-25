import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SetupInfo } from "../../shared/api.ts";
import { setupCopy } from "../src/setup.ts";

const info = (reason: SetupInfo["reason"]): SetupInfo => ({ reason, detail: null, issueCommand: 't3 auth session issue --label "X" --token-only', installUrl: "https://t3.example" });

test("a stopped T3 Code says how to start it, with no paste field", () => {
  const copy = setupCopy(info("t3-stopped"));
  assert.equal(copy.title, "T3 Code is not running");
  assert.ok(copy.steps.some((step) => step.includes("Open the T3 Code app")));
  assert.deepEqual([copy.showPaste, copy.command, copy.link], [false, null, null]);
});

test("a missing t3 links to the install page", () => {
  const copy = setupCopy(info("t3-missing"));
  assert.deepEqual(copy.link, { label: "Get T3 Code", url: "https://t3.example" });
  assert.equal(copy.showPaste, false);
});

test("a token to paste shows the exact command and the paste field", () => {
  const copy = setupCopy(info("token-needed"));
  assert.equal(copy.command, 't3 auth session issue --label "X" --token-only');
  assert.equal(copy.showPaste, true);
  assert.equal(copy.link, null);
});

test("every step is one short sentence", () => {
  for (const reason of ["t3-stopped", "t3-missing", "token-needed"] as const) {
    for (const step of setupCopy(info(reason)).steps) assert.ok(step.split(" ").length <= 15 && step.endsWith("."), step);
  }
});
