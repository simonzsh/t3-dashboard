import { test } from "bun:test";
import assert from "node:assert/strict";
import { maskedTopic, SETUP_STEPS, testMessage } from "../../../src/features/settings/alertsSettings.ts";

test("the steps name the app, the Set up button and the subscription", () => {
  assert.equal(SETUP_STEPS.length, 3);
  assert.match(SETUP_STEPS[0]!, /ntfy/);
  assert.match(SETUP_STEPS[1]!, /Set up/);
  assert.match(SETUP_STEPS[2]!, /Subscribe/);
});

test("each test result tells the user what to do", () => {
  assert.match(testMessage("ok"), /Check your phone/);
  assert.match(testMessage("refused"), /refused/);
  assert.match(testMessage("unreachable"), /reach/);
});

test("the topic shows masked: the generated prefix and the last 4 characters only", () => {
  assert.equal(maskedTopic("t3-dashboard-fs4SRzU4qceyqIBK"), "t3-dashboard-••••qIBK");
  assert.equal(maskedTopic("my-secret-topic"), "••••opic");
});
