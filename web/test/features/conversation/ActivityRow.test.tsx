import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RobotVisibilityContext } from "../../../src/lib/robotPreference.ts";
import { ActivityRow } from "../../../src/features/conversation/ActivityRow.tsx";

test("the background robot replaces the loader when enabled", () => {
  const html = renderToStaticMarkup(<ActivityRow background />);
  assert.match(html, /class="working-robot background".*Running in the background…/);
  assert.doesNotMatch(html, /class="loader inline"/);
});

test("the background row uses the loader when the robot is disabled", () => {
  const html = renderToStaticMarkup(
    <RobotVisibilityContext.Provider value={false}><ActivityRow background /></RobotVisibilityContext.Provider>,
  );
  assert.match(html, /class="loader inline".*aria-label="Background activity".*Running in the background…/);
  assert.doesNotMatch(html, /class="working-robot/);
});
