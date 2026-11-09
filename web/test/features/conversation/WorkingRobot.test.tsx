import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkingRobot } from "../../../src/features/conversation/WorkingRobot.tsx";

test("waiting takes priority over thinking and typing", () => {
  const out = renderToStaticMarkup(<WorkingRobot thinking waiting />);
  assert.match(out, /working-robot waiting/);
  assert.doesNotMatch(out, /working-robot thinking|working-robot typing/);
  assert.match(out, /aria-hidden="true"/);
});
