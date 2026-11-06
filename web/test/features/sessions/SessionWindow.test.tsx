import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionWindow } from "../../../src/features/sessions/SessionWindow.tsx";
import { thread } from "../../fixtures.ts";

const base = { id: "t1", thread: null, title: "Fix login", projectTitle: null, projectIcon: null, focused: true, maximized: false, compact: false, live: true, t3EnvironmentId: null, providers: [], dispatch: () => {} };

test("a missing window keeps its classes and shows the message with a close button", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} missing />);
  assert.match(html, /<section class="session-window focused" data-session-window="t1"/);
  assert.match(html, /<header class="session-window-head">/);
  assert.match(html, /This thread was archived or deleted\./);
  assert.match(html, /aria-label="Close"/);
});

test("the header has a grip, Fullscreen and Close", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} missing />);
  assert.match(html, /sc-grip/);
  assert.match(html, /aria-label="Fullscreen"/);
});

test("the sub-line names the project only when the thread and its project are known", () => {
  const known = renderToStaticMarkup(<SessionWindow {...base} thread={thread("t1")} projectTitle="Billing" missing />);
  assert.match(known, /<div class="sc-sub">.*<span class="dw-project">Billing<\/span>/);
  assert.doesNotMatch(renderToStaticMarkup(<SessionWindow {...base} projectTitle="Billing" missing />), /sc-sub/);
  assert.doesNotMatch(renderToStaticMarkup(<SessionWindow {...base} thread={thread("t1")} missing />), /sc-sub/);
});

test("a window far off screen keeps its header and skips the conversation", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} live={false} missing={false} thread={thread("t1")} />);
  assert.match(html, /<header class="session-window-head">/);
  assert.match(html, /sessions-placeholder/);
});

test("only running, waiting and error sessions show a state badge", () => {
  const badge = (over: Parameters<typeof thread>[1]) => renderToStaticMarkup(<SessionWindow {...base} live={false} missing={false} thread={thread("t1", over)} />);
  assert.match(badge({ status: "running" }), /dw-state[^>]*>.*Running/);
  assert.doesNotMatch(badge({ status: "completed" }), /dw-state|>Done</);
  assert.doesNotMatch(badge({ status: "idle" }), /dw-state|>Idle</);
});
