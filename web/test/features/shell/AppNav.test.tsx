import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AppNav } from "../../../src/features/shell/AppNav.tsx";

const base = {
  tab: "desk" as const,
  badges: { homeUnread: 0, deskRunning: 0, deskWaiting: false },
  badgeText: (n: number) => (n > 9 ? "9+" : String(n)),
  live: true,
  theme: "dark" as const,
  update: null,
  onTab: () => {},
  onSearch: () => {},
  onSettings: () => {},
  onTheme: () => {},
  onUpdate: () => {},
};
const side = (over = {}) => renderToStaticMarkup(<AppNav layout="side" {...base} {...over} />);
const bottom = (over = {}) => renderToStaticMarkup(<AppNav layout="bottom" {...base} {...over} />);

test("the sidebar lists Home, Desk and Automations, with the open page marked current", () => {
  const out = side();
  assert.match(out, /<nav class="sidebar/);
  assert.deepEqual([...out.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]), ["home", "desk", "automations"]);
  assert.match(out, /aria-current="page"[^>]*data-tab="desk"|data-tab="desk"[^>]*aria-current="page"/);
  assert.equal(out.match(/aria-current="page"/g)?.length, 1);
});

test("the sidebar has the search button with its shortcut hint", () => {
  assert.match(side(), /Search…[\s\S]*?<kbd>(Ctrl\+K|⌃K)<\/kbd>/);
});

test("the sidebar shows unread on Home, running on Desk and a dot for a waiting agent", () => {
  const out = side({ badges: { homeUnread: 12, deskRunning: 2, deskWaiting: true } });
  assert.match(out, /aria-label="12 unread">9\+</);
  assert.match(out, /aria-label="2 running">2</);
  assert.match(out, /aria-label="An agent is waiting for your reply"/);
  assert.doesNotMatch(side(), /nav-badge|An agent is waiting/);
});

test("the sidebar footer shows the connection and offers the other theme", () => {
  assert.match(side(), /Connected/);
  assert.match(side({ live: false }), /Offline/);
  assert.match(side({ theme: "dark" }), /aria-label="Switch to light theme"/);
  assert.match(side({ theme: "light" }), /aria-label="Switch to dark theme"/);
});

test("the sidebar shows the update button only when an update is ready", () => {
  assert.doesNotMatch(side(), /update-pill/);
  assert.match(side({ update: { label: "Update v1.2.3", busy: false } }), /update-pill[^>]*>[\s\S]*?Update v1\.2\.3/);
});

test("the bottom bar has the three pages and Settings, and no sidebar", () => {
  const out = bottom();
  assert.match(out, /<nav class="bottom-nav"/);
  assert.doesNotMatch(out, /sidebar|Search…/);
  assert.deepEqual([...out.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]), ["home", "desk", "automations"]);
  assert.match(out, />Settings</);
  assert.equal(out.match(/aria-current="page"/g)?.length, 1);
});

test("the bottom bar puts the badges on the icons", () => {
  const out = bottom({ badges: { homeUnread: 3, deskRunning: 0, deskWaiting: true } });
  assert.match(out, /aria-label="3 unread">3</);
  assert.match(out, /aria-label="An agent is waiting for your reply"/);
});
