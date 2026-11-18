import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RobotVisibilityContext } from "../../../src/lib/robotPreference.ts";
import { ActivityRow } from "../../../src/features/conversation/ActivityRow.tsx";

test("the background robot replaces the loader when enabled", () => {
  const html = renderToStaticMarkup(<ActivityRow activity="background" />);
  assert.match(html, /class="working-robot background".*Running in the background…/);
  assert.doesNotMatch(html, /class="loader inline"/);
});

test("the background row uses the loader when the robot is disabled", () => {
  const html = renderToStaticMarkup(
    <RobotVisibilityContext.Provider value={false}><ActivityRow activity="background" /></RobotVisibilityContext.Provider>,
  );
  assert.match(html, /class="loader inline".*aria-label="Background activity".*Running in the background…/);
  assert.doesNotMatch(html, /class="working-robot/);
});

test("the waiting row shows the robot or the waiting icon", () => {
  const row = <ActivityRow activity="waiting" />;
  const withRobot = renderToStaticMarkup(row);
  assert.match(withRobot, /class="working-robot waiting".*Waiting for your reply/);
  assert.doesNotMatch(withRobot, /waiting-icon/);

  const withoutRobot = renderToStaticMarkup(<RobotVisibilityContext.Provider value={false}>{row}</RobotVisibilityContext.Provider>);
  assert.match(withoutRobot, /waiting-icon.*Waiting for your reply/);
  assert.doesNotMatch(withoutRobot, /working-robot/);
  assert.doesNotMatch(withRobot + withoutRobot, /class="loader inline"/);
});
