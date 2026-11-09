import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PullRequestsButton, SessionWindow } from "../../../src/features/sessions/SessionWindow.tsx";
import { thread } from "../../fixtures.ts";

const base = { id: "t1", thread: null, title: "Fix login", projectTitle: null, projectIcon: null, focused: true, maximized: false, compact: false, live: true, t3EnvironmentId: null, providers: [], openPrs: new Map(), alert: null, onToggleAlert: () => {}, dispatch: () => {} };

test("a missing window keeps its classes and shows the message with a close button", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} missing />);
  assert.match(html, /<section class="session-window focused" data-session-window="t1"/);
  assert.match(html, /<header class="session-window-head">/);
  assert.match(html, /This thread was archived or deleted\./);
  assert.match(html, /aria-label="Close"/);
});

test("the header has a grip, Fullscreen and Close", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} missing />);
  assert.match(html, /session-window-grip/);
  assert.match(html, /aria-label="Fullscreen"/);
});

test("the sub-line names the project only when the thread and its project are known", () => {
  const known = renderToStaticMarkup(<SessionWindow {...base} thread={thread("t1")} projectTitle="Billing" missing />);
  assert.match(known, /<div class="session-window-sub">.*<span class="session-window-project">Billing<\/span>/);
  assert.doesNotMatch(renderToStaticMarkup(<SessionWindow {...base} projectTitle="Billing" missing />), /session-window-sub/);
  assert.doesNotMatch(renderToStaticMarkup(<SessionWindow {...base} thread={thread("t1")} missing />), /session-window-sub/);
});

test("a window far off screen keeps its header and skips the conversation", () => {
  const html = renderToStaticMarkup(<SessionWindow {...base} live={false} missing={false} thread={thread("t1")} />);
  assert.match(html, /<header class="session-window-head">/);
  assert.match(html, /sessions-placeholder/);
});

test("only running, waiting and error sessions show a state badge", () => {
  const badge = (over: Parameters<typeof thread>[1]) => renderToStaticMarkup(<SessionWindow {...base} live={false} missing={false} thread={thread("t1", over)} />);
  assert.match(badge({ status: "running" }), /session-window-state[^>]*>.*Running/);
  assert.doesNotMatch(badge({ status: "completed" }), /session-window-state|>Done</);
  assert.doesNotMatch(badge({ status: "idle" }), /session-window-state|>Idle</);
});

test("a back arrow shows only when the window can go back to the list", () => {
  assert.match(renderToStaticMarkup(<SessionWindow {...base} compact onBack={() => {}} missing />), /aria-label="Back to the list"/);
  assert.doesNotMatch(renderToStaticMarkup(<SessionWindow {...base} compact missing />), /Back to the list/);
});

const linked = (number: number, title: string | null = null) => ({ repository: "acme/storefront", number, url: `https://example.test/acme/storefront/pull/${number}`, title });
const header = (pullRequests: ReturnType<typeof linked>[]) => renderToStaticMarkup(<SessionWindow {...base} live={false} missing={false} thread={thread("t1", { pullRequests })} />);

test("a session with one pull request gets a link to its diff on the Pull requests page", () => {
  assert.match(header([linked(12)]), /<a [^>]*href="#\/pulls\/acme\/storefront\/12"[^>]*aria-label="Open pull request #12"/);
  assert.doesNotMatch(header([]), /pull request/);
});

test("a session with several pull requests gets one menu button, with no badge when none is unread", () => {
  const html = header([linked(12, "Summary"), linked(13)]);
  assert.match(html, /<button aria-haspopup="menu" [^>]*aria-label="2 pull requests"[^>]*class="icon-button sm ghost">/);
  assert.doesNotMatch(html, /count-badge/);
  assert.doesNotMatch(html, /href="#\/pulls/);
});

test("every control in the session header has the icon button classes, so they share one size", () => {
  for (const html of [header([]), header([linked(12)]), header([linked(12), linked(13)])]) {
    const buttons = html.slice(html.indexOf('class="session-window-buttons"'), html.indexOf("</span></div>", html.indexOf('class="session-window-buttons"')));
    const controls = [...buttons.matchAll(/<(button|a) [^>]*class="([^"]*)"/g)].map((m) => m[2]!);
    assert.ok(controls.length >= 2, buttons);
    for (const cls of controls) assert.match(cls, /^icon-button sm ghost$/, cls);
  }
});
test("the pull request menu items open each diff, with the title when T3 knows it", () => {
  const opened: string[] = [];
  const items = PullRequestsButton({ pullRequests: [linked(12, "Summary"), linked(13)], open: new Map() })!.props.items as Array<{ label: string; detail?: string; onSelect: () => void }>;
  assert.deepEqual(items.map((item) => [item.label, item.detail]), [["#13 acme/storefront", undefined], ["#12 acme/storefront", "Summary"]]);
  const location = { hash: "" };
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: { location }, configurable: true });
  try {
    for (const item of items) {
      item.onSelect();
      opened.push(location.hash);
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, "window", saved);
    else delete (globalThis as { window?: unknown }).window;
  }
  assert.deepEqual(opened, ["#/pulls/acme/storefront/13", "#/pulls/acme/storefront/12"]);
});

const openOf = (entries: Array<[number, string, boolean]>) => new Map(entries.map(([n, createdAt, unread]) => [`pr:acme/storefront#${n}`, { createdAt, unread }]));

test("the menu marks only the unread open pull requests, whatever the case of the repository", () => {
  const items = PullRequestsButton({ pullRequests: [linked(12), linked(13), linked(14)], open: openOf([[13, "", true]]) })!.props.items as Array<{ label: string; unread: boolean }>;
  assert.deepEqual(items.map((item) => [item.label, item.unread]), [["#14 acme/storefront", false], ["#13 acme/storefront", true], ["#12 acme/storefront", false]]);
  const upper = PullRequestsButton({ pullRequests: [{ ...linked(12), repository: "Acme/Storefront" }, linked(13)], open: openOf([[12, "", true]]) })!.props.items as Array<{ unread: boolean }>;
  assert.deepEqual(upper.map((item) => item.unread), [false, true]);
});

test("the menu badge counts only the unread pull requests, and is gone when all are read", () => {
  const menu = (unread: number[]) => PullRequestsButton({ pullRequests: [linked(12), linked(13), linked(14)], open: openOf([12, 13, 14].map((n) => [n, "", unread.includes(n)])) })!.props as { count: number; label: string };
  assert.deepEqual([menu([]).count, menu([13]).count, menu([12, 13, 14]).count], [0, 1, 3]);
  assert.equal(menu([]).label, "3 pull requests");
  assert.equal(menu([13]).label, "3 pull requests, 1 unread");
  const html = (unread: number[]) => renderToStaticMarkup(<SessionWindow {...base} openPrs={openOf([12, 13, 14].map((n) => [n, "", unread.includes(n)]))} live={false} missing={false} thread={thread("t1", { pullRequests: [linked(12), linked(13), linked(14)] })} />);
  assert.doesNotMatch(html([]), /icon-button-count/);
  assert.match(html([]), /aria-label="3 pull requests"/);
  assert.match(html([13]), /icon-button-count[^>]*>1</);
  assert.match(html([12, 13, 14]), /icon-button-count[^>]*>3</);
});

test("the menu puts the newest open pull request first, even when T3 lists the branch pull request last", () => {
  const open = openOf([[10, "2026-02-01T10:00:00.000Z", false], [11, "2026-02-02T10:00:00.000Z", false], [12, "2026-02-03T10:00:00.000Z", true]]);
  const items = PullRequestsButton({ pullRequests: [linked(11), linked(12), linked(10)], open })!.props.items as Array<{ label: string }>;
  assert.deepEqual(items.map((item) => item.label), ["#12 acme/storefront", "#11 acme/storefront", "#10 acme/storefront"]);
});

test("a session with one unread pull request shows the unread ring on its link, and none once read", () => {
  const html = (unread: boolean) => renderToStaticMarkup(<SessionWindow {...base} openPrs={openOf([[12, "2026-02-01T10:00:00.000Z", unread]])} live={false} missing={false} thread={thread("t1", { pullRequests: [linked(12)] })} />);
  assert.match(html(true), /aria-label="Open pull request #12 \(unread\)"[^>]*>.*<span class="notif-dot icon-button-dot" aria-hidden="true">/);
  assert.doesNotMatch(html(false), /notif-dot/);
});

test("the alert bell shows only when alerts are set up, and reports whether it is armed", () => {
  const bell = (alert: "armed" | "off" | null) => renderToStaticMarkup(<SessionWindow {...base} alert={alert} missing />);
  assert.doesNotMatch(bell(null), /Alert/);
  assert.match(bell("off"), /aria-label="Alert me on my phone"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Alert me on my phone"/);
  assert.match(bell("armed"), /aria-label="Alert on: click to turn off"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Alert on: click to turn off"/);
});
