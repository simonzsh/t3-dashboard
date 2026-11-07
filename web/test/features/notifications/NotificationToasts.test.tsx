import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationToasts } from "../../../src/features/notifications/NotificationToasts.tsx";
import { statusMap, transitions } from "../../../src/features/notifications/notifications.ts";
import { baseState, thread } from "../../fixtures.ts";

const toasts = transitions(statusMap([thread("w"), thread("f", { status: "running" })]), [
  thread("w", { title: "Needs a reply", status: "waiting", pending: { category: "approval" } }),
  thread("f", { title: "All done", status: "completed" }),
]);
const noop = () => {};

test("toasts are a polite live region with a labelled dismiss button and no native title", () => {
  const projects = baseState().projects.map((project) => ({ ...project, icon: { kind: "emoji" as const, emoji: "🌿" } }));
  const out = renderToStaticMarkup(<NotificationToasts toasts={toasts} projects={projects} onOpen={noop} onDismiss={noop} />);
  assert.match(out, /aria-live="polite"/);
  assert.equal(out.match(/aria-label="Dismiss"/g)?.length, 2);
  assert.match(out, /Needs a reply/);
  assert.equal(out.match(/class="project-icon"/g)?.length, 2);
  assert.equal(out.match(/🌿/g)?.length, 2);
  assert.doesNotMatch(out, /provider-icon/);
  assert.doesNotMatch(out, / title=/);
});
