import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestDock } from "../../../src/features/conversation/RequestDock.tsx";

test("request panels share a title, accessible toggle, and body", () => {
  for (const collapsed of [false, true]) {
    const out = renderToStaticMarkup(<RequestDock title="Request" label="Agent request" collapsed={collapsed} onToggle={() => {}}>Body content</RequestDock>);
    assert.match(out, /question-dock-title/);
    assert.match(out, new RegExp(`aria-expanded="${!collapsed}"`));
    assert.equal(out.includes("Body content"), !collapsed);
  }
});
