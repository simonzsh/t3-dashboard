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
  onCloseAll: () => {},
};

test("grouped mode: a project row with its + button, then its threads with time and model", () => {
  const html = renderToStaticMarkup(<SessionList {...base} onHide={() => {}} />);
  assert.match(html, /slist-project-title">Project A</);
  assert.match(html, /aria-label="New session in Project A"/);
  assert.match(html, /5 min ago · Model One/);
  assert.match(html, /aria-label="Hide the list"/);
});

test("open threads get the open class, the focused one also the focused class", () => {
  const html = renderToStaticMarkup(<SessionList {...base} />);
  assert.match(html, /class="slist-row open focused" aria-current="true"/);
  assert.equal(html.match(/slist-row open"/g)?.length, 1);
  assert.doesNotMatch(html, /Hide the list/);
});

test("a collapsed project hides its threads; flat mode has no project rows", () => {
  assert.doesNotMatch(renderToStaticMarkup(<SessionList {...base} prefs={{ ...DEFAULT_LIST_PREFS, collapsed: ["project-a"] }} />), /Fix login/);
  const flat = renderToStaticMarkup(<SessionList {...base} prefs={{ ...DEFAULT_LIST_PREFS, mode: "flat" }} />);
  assert.doesNotMatch(flat, /slist-project/);
  assert.match(flat, /Fix login/);
});
