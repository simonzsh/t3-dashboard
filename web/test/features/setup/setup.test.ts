import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SetupInfo } from "../../../../shared/api.ts";
import { setupCopy } from "../../../src/features/setup/setup.ts";

const info = (reason: SetupInfo["reason"]): SetupInfo => ({ reason, detail: null, issueCommand: 't3 auth session issue --label "X" --token-only', installUrl: "https://t3.example", installCommand: "curl -fsSL https://t3.codes/install.sh | sh", startCommand: "t3 start" });
const commands = (reason: SetupInfo["reason"]) => setupCopy(info(reason)).steps.flatMap((step) => (step.command ? [step.command] : []));

test("a stopped T3 Code shows the start command and an install link, with no paste field", () => {
  const copy = setupCopy(info("t3-stopped"));
  assert.equal(copy.title, "T3 Code is not running");
  assert.ok(copy.steps[0]!.text.includes("Open the T3 Code app"));
  assert.deepEqual(commands("t3-stopped"), ["t3 start"]);
  assert.equal(copy.showPaste, false);
  assert.deepEqual(copy.link, { label: "Not installed? Get T3 Code", url: "https://t3.example" });
});

test("a missing t3 shows the install command and links to the install page", () => {
  const copy = setupCopy(info("t3-missing"));
  assert.equal(copy.title, "Install T3 Code");
  assert.deepEqual(commands("t3-missing"), ["curl -fsSL https://t3.codes/install.sh | sh"]);
  assert.deepEqual(copy.link, { label: "Get the T3 Code app", url: "https://t3.example" });
  assert.equal(copy.showPaste, false);
});

test("a token to paste shows the exact command and the paste field", () => {
  const copy = setupCopy(info("token-needed"));
  assert.deepEqual(commands("token-needed"), ['t3 auth session issue --label "X" --token-only']);
  assert.equal(copy.showPaste, true);
  assert.equal(copy.link, null);
});

test("the lede and every step are one short sentence", () => {
  for (const reason of ["t3-stopped", "t3-missing", "token-needed"] as const) {
    const copy = setupCopy(info(reason));
    for (const text of [copy.lede, ...copy.steps.map((step) => step.text)]) assert.ok(text.split(" ").length <= 15 && text.endsWith("."), text);
  }
});
