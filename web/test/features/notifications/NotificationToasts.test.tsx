import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationToasts } from "../../../src/features/notifications/NotificationToasts.tsx";
import { statusMap, transitions } from "../../../src/features/notifications/notifications.ts";
import { thread } from "../../fixtures.ts";

const toasts = transitions(statusMap([thread("w"), thread("f", { status: "running" })]), [
  thread("w", { title: "Needs a reply", status: "waiting", pending: { category: "approval" } }),
  thread("f", { title: "All done", status: "completed" }),
]);
const noop = () => {};

test("toasts are a polite live region with a labelled dismiss button and no native title", () => {
  const out = renderToStaticMarkup(<NotificationToasts toasts={toasts} onOpen={noop} onDismiss={noop} />);
  assert.match(out, /aria-live="polite"/);
  assert.equal(out.match(/aria-label="Dismiss"/g)?.length, 2);
  assert.match(out, /Needs a reply/);
  assert.doesNotMatch(out, / title=/);
});
