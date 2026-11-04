import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { InboxView } from "../../../src/features/inbox/InboxView.tsx";
import { baseState, thread } from "../../fixtures.ts";

const ask = { category: "approval" as const };
const render = (threads: ReturnType<typeof thread>[]) =>
  renderToStaticMarkup(
    <InboxView
      state={baseState(threads)}
      now={new Date("2026-01-10T12:00:00.000Z")}
      deskIds={new Set()}
      onOpen={() => {}}
      onToggleDesk={() => {}}
      onSettle={async () => {}}
      onSwitcher={() => {}}
      automations={{ automations: [], hiddenThreadIds: ["t-routine"], setupThreadIds: [] }}
      automationsError={null}
      onAutomationsStale={async () => {}}
      linearVersion={0}
    />,
  );

test("an empty Inbox says nothing needs you", () => {
  assert.match(render([]), /Nothing needs you/);
});

test("sections show in urgency order, with the project as a tag and running closed", () => {
  const out = render([
    thread("fin", { title: "Finished one", status: "completed" }),
    thread("wait", { title: "Waiting one", status: "waiting", pending: ask }),
    thread("run", { title: "Running one", status: "running" }),
  ]);
  assert.ok(out.indexOf("Waiting for you") < out.indexOf("Finished"));
  assert.match(out, /project-tag-text">Project A</);
  assert.match(out, /Running \(1\)/);
  assert.doesNotMatch(out, /Running one/);
  assert.doesNotMatch(out, /Nothing needs you/);
});

test("routine threads stay out of the Inbox", () => {
  assert.doesNotMatch(render([thread("t-routine", { title: "Routine run" })]), /Routine run/);
});
