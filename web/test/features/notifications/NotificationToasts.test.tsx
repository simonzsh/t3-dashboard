import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationBell, NotificationList, NotificationToasts } from "../../../src/features/notifications/NotificationBell.tsx";
import { notifyEntries } from "../../../src/features/notifications/notifications.ts";
import { thread } from "../../fixtures.ts";

const now = new Date("2026-01-10T11:00:00.000Z");
const entries = notifyEntries(
  [
    thread("w", { title: "Needs a reply", status: "waiting", pending: { category: "approval" } }),
    thread("f", { title: "All done", status: "completed", lastActivityAt: "2026-01-10T09:00:00.000Z" }),
  ],
  { since: "2026-01-10T09:30:00.000Z", seen: {} },
);
const noop = () => {};

test("the list shows title, status label and age; only unseen rows have a dot", () => {
  const out = renderToStaticMarkup(<NotificationList entries={entries} now={now} onOpen={noop} />);
  assert.match(out, /Needs a reply/);
  assert.match(out, /Needs approval/);
  assert.match(out, /All done/);
  assert.match(out, /Finished/);
  assert.match(out, /2 h ago/);
  assert.equal(out.match(/notif-dot/g)?.length, 1);
  assert.equal(out.match(/class="provider-icon/g)?.length, 2);
});

test("only unread rows get a Mark as read button, outside the row button", () => {
  const out = renderToStaticMarkup(<NotificationList entries={entries} now={now} onOpen={noop} onMarkRead={noop} />);
  assert.equal(out.match(/aria-label="Mark as read"/g)?.length, 1);
  assert.match(out, /<\/button><button[^>]*aria-label="Mark as read"/);
  assert.doesNotMatch(renderToStaticMarkup(<NotificationList entries={entries} now={now} onOpen={noop} />), /Mark as read/);
});

test("the list shows Mark all as read only when given the handler", () => {
  assert.match(renderToStaticMarkup(<NotificationList entries={entries} now={now} onOpen={noop} onMarkAllRead={noop} />), /Mark all as read/);
  assert.doesNotMatch(renderToStaticMarkup(<NotificationList entries={entries} now={now} onOpen={noop} />), /Mark all as read/);
});

test("an empty list says nothing needs the user", () => {
  assert.match(renderToStaticMarkup(<NotificationList entries={[]} now={now} onOpen={noop} />), /Nothing needs you right now/);
});

test("the bell names the unread count and caps the badge", () => {
  const props = { entries, now, onOpen: noop, open: false, onOpenChange: noop };
  const some = renderToStaticMarkup(<NotificationBell {...props} count={3} />);
  assert.match(some, /aria-label="Notifications, 3 unread"/);
  assert.match(some, /<span class="notif-count">3<\/span>/);
  assert.match(renderToStaticMarkup(<NotificationBell {...props} count={12} />), />9\+</);
  const none = renderToStaticMarkup(<NotificationBell {...props} count={0} />);
  assert.match(none, /aria-label="Notifications"/);
  assert.doesNotMatch(none, /notif-count/);
});

test("toasts are a polite live region with a labelled dismiss button and no native title", () => {
  const out = renderToStaticMarkup(<NotificationToasts toasts={entries} onOpen={noop} onDismiss={noop} />);
  assert.match(out, /aria-live="polite"/);
  assert.equal(out.match(/aria-label="Dismiss"/g)?.length, 2);
  assert.match(out, /Needs a reply/);
  assert.doesNotMatch(out, / title=/);
});
