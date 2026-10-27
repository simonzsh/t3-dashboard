import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DeskWindow } from "../../../src/features/desk/DeskWindow.tsx";

const base = { id: "t1", thread: null, projectTitle: null, focused: true, maximized: false, compact: false, t3EnvironmentId: null, providers: [], dispatch: () => {} };

test("a missing window keeps its classes and shows the message with a close button", () => {
  const html = renderToStaticMarkup(<DeskWindow {...base} missing />);
  assert.match(html, /<section class="desk-window focused" data-desk-window="t1"/);
  assert.match(html, /<header class="desk-window-head">/);
  assert.match(html, /This thread was archived or deleted\./);
  assert.match(html, /aria-label="Close"/);
});
