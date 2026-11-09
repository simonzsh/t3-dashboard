import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkingRobot } from "../../../src/features/conversation/WorkingRobot.tsx";

test("waiting takes priority over thinking and typing", () => {
  const out = renderToStaticMarkup(<WorkingRobot thinking waiting sleeping />);
  assert.match(out, /working-robot waiting/);
  assert.doesNotMatch(out, /working-robot thinking|working-robot typing/);
  assert.match(out, /aria-hidden="true"/);
});


test("a resting robot closes its eyes and shows sleep marks", () => {
  const out = renderToStaticMarkup(<WorkingRobot sleeping />);
  assert.match(out, /working-robot sleeping/);
  assert.match(out, /robot-snooze/);
  assert.doesNotMatch(out, /working-robot typing|robot-wave-arm/);
});

test("a request wakes the robot even when sleeping is set", () => {
  const out = renderToStaticMarkup(<WorkingRobot sleeping waiting />);
  assert.match(out, /working-robot waiting/);
  assert.doesNotMatch(out, /robot-snooze/);
});

test("the robot is a named keyboard and touch accessible button", () => {
  const awake = renderToStaticMarkup(<WorkingRobot />);
  const asleep = renderToStaticMarkup(<WorkingRobot sleeping />);
  assert.match(awake, /<button[^>]*type="button"/);
  assert.match(awake, /aria-label="Greet the robot"/);
  assert.match(asleep, /aria-label="Wake the robot"/);
  assert.doesNotMatch(awake, /<button[^>]*aria-hidden/);
});

test("the greeting uses two heart eyes without a separate flying heart", () => {
  const out = renderToStaticMarkup(<WorkingRobot />);
  assert.match(out, /robot-love-eyes/);
  assert.equal((out.match(/viewBox="0 0 24 24"/g) ?? []).length, 2);
  assert.doesNotMatch(out, /robot-hello/);
});
