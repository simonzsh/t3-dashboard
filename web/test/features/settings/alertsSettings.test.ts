import { test } from "bun:test";
import assert from "node:assert/strict";
import { SETUP_STEPS, serverBody, testMessage, topicBody } from "../../../src/features/settings/alertsSettings.ts";

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

test("a pasted topic is trimmed, and a blank server is left out", () => {
  assert.deepEqual(topicBody(" my-topic ", "  "), { topic: "my-topic" });
  assert.deepEqual(topicBody("my-topic", " https://ntfy.example.org "), { topic: "my-topic", server: "https://ntfy.example.org" });
});

test("a blank server field sets up on the default server", () => {
  assert.deepEqual(serverBody(" "), {});
  assert.deepEqual(serverBody("https://ntfy.example.org"), { server: "https://ntfy.example.org" });
});
