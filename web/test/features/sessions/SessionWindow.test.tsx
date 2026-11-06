import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionWindow } from "../../../src/features/sessions/SessionWindow.tsx";
import { thread } from "../../fixtures.ts";

const base = { id: "t1", thread: null, projectTitle: null, projectIcon: null, focused: true, maximized: false, compact: false, t3EnvironmentId: null, providers: [], dispatch: () => {} };

test("a missing window keeps its classes and shows the message with a close button", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} missing />);
  assert.match(html, /<section class="session-window focused" data-session-window="t1"/);
  assert.match(html, /<header class="session-window-head">/);
  assert.match(html, /This thread was archived or deleted\./);
  assert.match(html, /aria-label="Close"/);
});

test("the header has a grip, Fullscreen and Close, and no Minimize", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} missing />);
  assert.match(html, /sc-grip/);
  assert.match(html, /aria-label="Fullscreen"/);
  assert.doesNotMatch(html, /Minimize/);
});

test("the sub-line names the project only when the thread and its project are known", () => {
  const known = renderToStaticMarkup(<SessionWindow {...base} thread={thread("t1")} projectTitle="Billing" missing />);
  assert.match(known, /<div class="sc-sub">.*<span class="dw-project">Billing<\/span>/);
  assert.doesNotMatch(renderToStaticMarkup(<SessionWindow {...base} projectTitle="Billing" missing />), /sc-sub/);
  assert.doesNotMatch(renderToStaticMarkup(<SessionWindow {...base} thread={thread("t1")} missing />), /sc-sub/);
});
