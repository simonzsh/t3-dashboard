import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { inboxThreads } from "../../../src/features/inbox/inbox.ts";
import { InboxView } from "../../../src/features/inbox/InboxView.tsx";
import { baseState, thread } from "../../fixtures.ts";

const ask = { category: "approval" as const };
const render = (
  threads: ReturnType<typeof thread>[],
  seen = { since: "2026-01-01T00:00:00.000Z", seen: {} as Record<string, string> },
  state = baseState(threads),
) =>
  renderToStaticMarkup(
    <InboxView
      state={state}
      visible={inboxThreads(threads, ["t-routine"])}
      now={new Date("2026-01-10T12:00:00.000Z")}
      deskIds={new Set()}
      onOpen={() => {}}
      onToggleDesk={() => {}}
      onSettle={async () => {}}
      seen={seen}
      seenReady
      onMarkRead={() => {}}
      onSwitcher={() => {}}
      automations={{ automations: [], hiddenThreadIds: ["t-routine"], setupThreadIds: [] }}
      automationsError={null}
      linearVersion={0}
    />,
  );

test("an empty Inbox says nothing needs you", () => {
  assert.match(render([]), /Nothing needs you/);
});

test("sections show in urgency order, with a summary, the project as a tag and running open", () => {
  const out = render([
    thread("fin", { title: "Finished one", status: "completed" }),
    thread("wait", { title: "Waiting one", status: "waiting", pending: ask }),
    thread("run", { title: "Running one", status: "running" }),
  ]);
  assert.match(out, /1 needs you · 1 unread/);
  assert.ok(out.indexOf("Needs you") < out.indexOf(">Unread"));
  assert.match(out, /Mark all read/);
  assert.match(out, /project-tag-text">Project A</);
  assert.match(out, /Running one/);
  assert.ok(out.indexOf(">Unread") < out.indexOf("Running"));
  assert.doesNotMatch(out, /Nothing needs you/);
});

test("a read result leaves unread and waits in read and idle", () => {
  const read = thread("fin", { title: "Finished one", status: "completed" });
  const out = render([read], { since: "2026-01-01T00:00:00.000Z", seen: { fin: read.lastActivityAt } });
  assert.doesNotMatch(out, />Unread/);
  assert.match(out, /Read and idle \(1\)/);
  assert.match(out, /Nothing needs you/);
});

test("the lists stop at 10 rows with a button for the rest", () => {
  const out = render(Array.from({ length: 12 }, (_, i) => thread(`w${i}`, { title: `Wait ${i}`, status: "waiting", pending: ask })));
  assert.match(out, /Show 2 more/);
  assert.equal(out.match(/inbox-title/g)?.length, 10);
});

test("routine threads stay out of the Inbox", () => {
  assert.doesNotMatch(render([thread("t-routine", { title: "Routine run" })]), /Routine run/);
});

const withProject = (threads: ReturnType<typeof thread>[]) => {
  const state = baseState(threads);
  state.projects = [{ ...state.projects[0]!, icon: { shapes: [{ tag: "circle", attrs: { cx: "12", cy: "12", r: "9" } }], color: null } }];
  state.providers = [
    { instanceId: "provider-a", displayName: "Provider A", runtimeModes: [], models: [{ slug: "model-x", name: "Model X", effort: null, speed: null, favorite: null }] },
  ];
  return state;
};

test("a card shows the project icon in its head, then provider icon, model name and project name", () => {
  const threads = [thread("a", { title: "Card", status: "completed", model: "model-x" })];
  const out = render(threads, undefined, withProject(threads));
  const head = out.slice(out.indexOf("inbox-row-head"), out.indexOf("inbox-title"));
  assert.match(head, /class="project-icon"/);
  assert.doesNotMatch(head, /provider-icon/);
  const meta = out.slice(out.indexOf("inbox-row-meta"), out.indexOf("inbox-row-foot"));
  assert.ok(meta.indexOf("provider-icon") < meta.indexOf("Model X"));
  assert.ok(meta.indexOf("Model X") < meta.indexOf("Project A"));
});

test("an unknown model shows its slug and a thread without a model shows only the project", () => {
  const threads = [thread("a", { status: "completed", model: "model-y" }), thread("b", { status: "completed" })];
  const out = render(threads, undefined, withProject(threads));
  assert.match(out, /inbox-model">model-y</);
  assert.equal(out.match(/inbox-model"/g)?.length, 1);
  assert.equal(out.match(/inbox-row-meta/g)?.length, 2);
});
