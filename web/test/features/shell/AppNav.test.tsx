import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AppNav } from "../../../src/features/shell/AppNav.tsx";

const base = {
  tab: "sessions" as const,
  unread: 0,
  sessions: { count: 0, waiting: false },
  automations: { count: 0, failed: false },
  news: 0,
  live: true,
  update: null,
  collapsed: false,
  onToggleCollapsed: () => {},
  onTab: () => {},
  onSearch: () => {},
  onSettings: () => {},
  onUpdate: () => {},
};
const side = (over = {}) => renderToStaticMarkup(<AppNav layout="side" {...base} {...over} />);
const bottom = (over = {}) => renderToStaticMarkup(<AppNav layout="bottom" {...base} {...over} />);

test("the sidebar lists Dashboard, Sessions, Automations, News and Git, with the open page marked current", () => {
  const out = side();
  assert.match(out, /<nav class="sidebar/);
  assert.deepEqual([...out.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]), ["dashboard", "sessions", "automations", "news", "git"]);
  assert.match(out, /aria-current="page"[^>]*data-tab="sessions"|data-tab="sessions"[^>]*aria-current="page"/);
  assert.equal(out.match(/aria-current="page"/g)?.length, 1);
});

test("the sidebar has the search button with its shortcut hint", () => {
  assert.match(side(), /Search…[\s\S]*?<kbd>⌘K<\/kbd>/);
});

test("the sidebar shows unread on Dashboard, running or unread on Sessions and a dot for a waiting agent", () => {
  const out = side({ unread: 12, sessions: { count: 2, waiting: true } });
  assert.match(out, /aria-label="12 unread">9\+</);
  assert.match(out, /aria-label="2 running or unread">2</);
  assert.match(out, /aria-label="An agent is waiting for your reply"/);
  assert.doesNotMatch(side(), /count-badge|An agent is waiting/);
});

test("the sidebar footer holds the connection, Settings and collapse on one row", () => {
  assert.match(side(), /sidebar-actions[^>]*>[\s\S]*?Connected[\s\S]*?aria-label="Settings"[\s\S]*?aria-label="Collapse the sidebar"/);
  assert.match(side({ live: false }), /Offline/);
});

test("the sidebar shows the update button only when an update is ready", () => {
  assert.doesNotMatch(side(), /update-pill/);
  assert.match(side({ update: { label: "Update v1.2.3", busy: false } }), /update-pill[^>]*>[\s\S]*?Update v1\.2\.3/);
});

test("the bottom bar has the five pages only (Settings is in the phone header), and no sidebar", () => {
  const out = bottom();
  assert.match(out, /<nav class="bottom-nav"/);
  assert.doesNotMatch(out, /sidebar|Search…/);
  assert.deepEqual([...out.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]), ["dashboard", "sessions", "automations", "news", "git"]);
  assert.doesNotMatch(out, /Settings/);
  assert.equal(out.match(/aria-current="page"/g)?.length, 1);
});

test("the bottom bar puts the badges on the icons", () => {
  const out = bottom({ unread: 3, sessions: { count: 0, waiting: true } });
  assert.match(out, /aria-label="3 unread">3</);
  assert.match(out, /aria-label="An agent is waiting for your reply"/);
});

test("the collapse button shows its Ctrl+B shortcut and follows the collapsed prop", () => {
  assert.match(side(), /aria-label="Collapse the sidebar"[^>]*data-shortcut="(Ctrl\+B|⌃B)"/);
  assert.match(side({ collapsed: true }), /<nav class="sidebar collapsed"[\s\S]*aria-label="Expand the sidebar"/);
});

test("the Automations entry shows the unread runs and a red dot when one failed, in both bars", () => {
  for (const out of [side({ automations: { count: 3, failed: true } }), bottom({ automations: { count: 3, failed: true } })]) {
    assert.match(out, /aria-label="3 unread runs">3</);
    assert.match(out, /class="nav-alert err"[^>]*aria-label="An automation run failed"|aria-label="An automation run failed"[^>]*class="nav-alert err"/);
  }
  assert.doesNotMatch(side({ automations: { count: 2, failed: false } }), /nav-alert/);
});

test("the Automations entry shows nothing when no run is unread", () => {
  assert.doesNotMatch(side(), /unread runs|automation run failed/);
});

test("News shows its unread articles like the other tabs, in the sidebar and the bottom bar", () => {
  for (const out of [side({ news: 2 }), bottom({ news: 2 })]) assert.match(out, /aria-label="2 unread articles">2</);
  assert.match(side({ news: 1 }), /aria-label="1 unread article">1</);
  assert.match(side({ news: 14 }), /aria-label="14 unread articles">9\+</);
  assert.doesNotMatch(side(), /count-badge/);
  assert.match(side({ news: 2 }), /data-tab="news"[\s\S]*count-badge/);
});
