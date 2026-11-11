import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResizeHandle } from "../../src/ui/ResizeHandle.tsx";

test("resize handles expose a named keyboard control for each axis", () => {
  for (const axis of ["x", "y"] as const) {
    const html = renderToStaticMarkup(<ResizeHandle axis={axis} label="Resize sessions" onDelta={() => {}} onReset={() => {}} />);
    assert.match(html, /<button/);
    assert.match(html, /aria-label="Resize sessions"/);
    assert.ok(html.includes(`resize-handle-${axis}`));
  }
});
