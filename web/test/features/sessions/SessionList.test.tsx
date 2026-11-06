import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionList } from "../../../src/features/sessions/SessionList.tsx";
import { DEFAULT_LIST_PREFS } from "../../../src/features/sessions/sessionList.ts";
import { baseState, thread } from "../../fixtures.ts";

const seen = { since: "2030-01-01T00:00:00.000Z", seen: {} };
const base = {
  threads: [thread("t1", { title: "Fix login", model: "m1" }), thread("t2", { title: "Refund flow" })],
  projects: baseState().projects,
  seen,
  modelNames: new Map([["m1", "Model One"]]),
  now: new Date("2026-01-10T10:05:00.000Z"),
  openIds: new Set(["t1", "t2"]),
  focusedId: "t2",
  prefs: DEFAULT_LIST_PREFS,
  onPrefs: () => {},
  onOpen: () => {},
  onNewSession: () => {},
  onClose: () => {},
  onCloseAll: () => {},
};

test("grouped mode: a project row with its + button, then its threads with time and model", () => {
  const html = renderToStaticMarkup(<SessionList {...base} />);
  assert.match(html, /slist-project-title">Project A</);
  assert.match(html, /aria-label="New session in Project A"/);
  assert.match(html, /5 min ago · <svg[^>]*provider-icon[^]*?<\/svg>Model One/);
  assert.match(html, /<aside[^>]*><div class="slist-bar">.*<\/div><div class="slist-body"><section/);
});

test("open threads get the open class, the focused one also the focused class", () => {
  const html = renderToStaticMarkup(<SessionList {...base} />);
  assert.match(html, /class="slist-row open focused" aria-current="true"/);
  assert.equal(html.match(/slist-row open"/g)?.length, 1);
});

test("a collapsed project hides its threads; flat mode has no project rows", () => {
  assert.doesNotMatch(renderToStaticMarkup(<SessionList {...base} prefs={{ ...DEFAULT_LIST_PREFS, collapsed: ["project-a"] }} />), /Fix login/);
  const flat = renderToStaticMarkup(<SessionList {...base} prefs={{ ...DEFAULT_LIST_PREFS, mode: "flat" }} />);
  assert.doesNotMatch(flat, /slist-project/);
  assert.match(flat, /Fix login/);
  // Flat rows name the project instead of the model.
  assert.match(flat, /5 min ago · <svg[^>]*project-icon[^]*?<\/svg>Project A/);
  assert.doesNotMatch(flat, /Model One/);
});

test("the top band, on the right: collapse all, view toggle, close all, and no hide button", () => {
  const html = renderToStaticMarkup(<SessionList {...base} />);
  const at = (label: string) => html.indexOf(`aria-label="${label}"`);
  const order = ["Collapse all projects", "Show one list by recent activity", "Close all sessions"].map(at);
  assert.ok(order[0]! >= 0 && order.every((n, i) => i === 0 || n > order[i - 1]!));
  assert.doesNotMatch(html, /Hide the list/);
});

test("all folded offers Expand all projects", () => {
  const html = renderToStaticMarkup(<SessionList {...base} />);
  assert.match(html, /Show one list by recent activity/);
  const folded = renderToStaticMarkup(<SessionList {...base} prefs={{ ...DEFAULT_LIST_PREFS, collapsed: ["project-a"] }} />);
  assert.match(folded, /aria-label="Expand all projects"/);
});

test("flat mode offers Group by project", () => {
  assert.match(renderToStaticMarkup(<SessionList {...base} prefs={{ ...DEFAULT_LIST_PREFS, mode: "flat" }} />), /aria-label="Group by project"/);
});

test("flat mode has no fold button; close all is disabled when nothing is open", () => {
  const html = renderToStaticMarkup(<SessionList {...base} openIds={new Set()} prefs={{ ...DEFAULT_LIST_PREFS, mode: "flat" }} />);
  assert.doesNotMatch(html, /all projects/);
  assert.match(html, /<button[^>]*aria-label="Close all sessions"[^>]*disabled|<button[^>]*disabled[^>]*aria-label="Close all sessions"/);
});

test("an open row has a close button beside it, a closed row has none", () => {
  const html = renderToStaticMarkup(<SessionList {...base} openIds={new Set(["t1"])} focusedId="t1" />);
  assert.match(html, /aria-label="Close Fix login"/);
  assert.doesNotMatch(html, /aria-label="Close Refund flow"/);
  assert.doesNotMatch(html, /<button[^>]*slist-row[^>]*>(?:(?!<\/button>).)*aria-label="Close/);
});
