import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RobotVisibilityContext } from "../../../src/lib/robotPreference.ts";
import { TurnStart } from "../../../src/features/conversation/TurnStart.tsx";

test("Thinking appears below the outgoing message while the new run starts", () => {
  const pending = [{ id: "p1", text: "ok go", attachments: [], duringRun: false, sentAt: 0, baseline: 0 }];
  const html = renderToStaticMarkup(<TurnStart pending={pending} threadId="t1" thinking />);
  assert.match(html, /ok go.*class="working-robot thinking".*Thinking…/);
  assert.doesNotMatch(html, /class="loader inline"/);
});

test("the loader appears to the left of Thinking when the robot is off", () => {
  const html = renderToStaticMarkup(
    <RobotVisibilityContext.Provider value={false}>
      <TurnStart pending={[]} threadId="t1" thinking />
    </RobotVisibilityContext.Provider>,
  );
  assert.match(html, /class="loader inline".*Thinking…/);
  assert.doesNotMatch(html, /class="working-robot/);
});
