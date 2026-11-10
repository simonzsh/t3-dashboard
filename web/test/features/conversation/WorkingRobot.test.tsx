import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.doesNotMatch(out, /working-robot typing/);
});

test("a request wakes the robot even when sleeping is set", () => {
  const out = renderToStaticMarkup(<WorkingRobot sleeping waiting />);
  assert.match(out, /working-robot waiting/);
  assert.doesNotMatch(out, /working-robot sleeping/);
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


test("background activity watches instead of typing, thinking or sleeping", () => {
  const out = renderToStaticMarkup(<WorkingRobot background thinking sleeping />);
  assert.match(out, /working-robot background/);
  assert.match(out, /robot-clock-minute/);
  assert.doesNotMatch(renderToStaticMarkup(<WorkingRobot background waiting />), /working-robot background/);
  assert.doesNotMatch(out, /working-robot sleeping|working-robot waiting/);
  assert.match(out, /aria-label="Greet the robot"/);
  assert.match(renderToStaticMarkup(<WorkingRobot background waiting />), /working-robot waiting/);
});

test("all poses retain the moving parts so transitions can fade and move them", () => {
  for (const props of [{}, { thinking: true }, { waiting: true }, { sleeping: true }, { background: true }]) {
    const out = renderToStaticMarkup(<WorkingRobot {...props} />);
    for (const part of ["robot-head", "robot-hand right", "robot-wave-arm", "robot-snooze", "robot-clock", "robot-thought"]) {
      assert.ok(out.includes(part), part);
    }
  }
});

test("coffee motion brings the cup and drinking arm in front of the head", () => {
  const source = readFileSync(new URL("../../../src/features/conversation/WorkingRobot.tsx", import.meta.url), "utf8");
  const sip = source.slice(source.indexOf("play(cup, ["), source.indexOf("drinking = false;", source.indexOf("play(cup, [")));
  for (const part of sip.split(/play\((?:cup|arm|hand), \[/).slice(1)) {
    const depths = [...part.matchAll(/translateZ\((\d+)px\).*offset: 0\.(?:42|52|65|73)/g)];
    assert.equal(depths.length, 4);
    assert.ok(depths.every(match => Number(match[1]) > 18), "held parts must clear the head depth");
  }
});
