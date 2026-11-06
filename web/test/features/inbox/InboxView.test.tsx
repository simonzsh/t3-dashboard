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
      sessionIds={new Set()}
      onOpen={() => {}}
      onToggleSessions={() => {}}
      onSettle={async () => {}}
      seen={seen}
      seenReady
      onMarkRead={() => {}}
      automations={{ automations: [], hiddenThreadIds: ["t-routine"], setupThreadIds: [] }}
      automationsError={null}
      linearVersion={0}
    >
      {(cards) => (
        <>
          <div id="n">{cards.notifications}</div>
          <div id="r">{cards.running}</div>
          <div id="u">{cards.upNext}</div>
        </>
      )}
    </InboxView>,
  );
const part = (out: string, id: "n" | "r" | "u") => out.slice(out.indexOf(`<div id="${id}">`), out.indexOf("</section>", out.indexOf(`<div id="${id}">`)));

test("an empty Home says nothing needs you and that no agent runs", () => {
  const out = render([]);
  assert.match(part(out, "n"), /Nothing needs you/);
  assert.match(part(out, "r"), /No agent is running/);
  assert.doesNotMatch(out, /inbox-summary|Recently settled|Read and idle/);
});

test("notifications list what needs you first, then unread, with a count and Mark all read", () => {
  const out = part(
    render([
      thread("fin", { title: "Finished one", status: "completed", model: "model-x" }),
      thread("wait", { title: "Waiting one", status: "waiting", pending: ask }),
      thread("bad", { title: "Failed one", status: "failed", lastError: "Disk full" }),
    ]),
    "n",
  );
  assert.match(out, /Notifications<\/h2><span class="count">3</);
  assert.ok(out.indexOf("notif-item needs") < out.indexOf("notif-item unread"));
  assert.ok(out.indexOf("Waiting one") < out.indexOf("Finished one"));
  assert.match(out, /Waiting for your approval/);
  assert.match(out, /Disk full/);
  assert.match(out, /aria-label="Mark all read"/);
  assert.match(out, /Project A · /);
  assert.doesNotMatch(out, /Nothing needs you/);
});

test("a read result stays in the list without a dot and greyed, under Nothing needs you", () => {
  const read = thread("fin", { title: "Finished one", status: "completed" });
  const out = part(render([read], { since: "2026-01-01T00:00:00.000Z", seen: { fin: read.lastActivityAt } }), "n");
  assert.match(out, /Nothing needs you/);
  assert.match(out, /notif-item read/);
  assert.doesNotMatch(out, /notif-dot/);
  assert.match(out, /<button disabled=""[^>]*aria-label="Mark all read"/);
});

test("read threads older than 3 days wait behind See all", () => {
  const old = thread("old", { title: "Old one", status: "completed", lastActivityAt: "2026-01-01T10:00:00.000Z" });
  const out = part(render([old], { since: "2025-12-01T00:00:00.000Z", seen: { old: old.lastActivityAt } }), "n");
  assert.doesNotMatch(out, /Old one/);
  assert.match(out, /See all \(1 more\)/);
});

test("an unread notification offers only Mark as read; Running rows keep their buttons", () => {
  const out = render([thread("fin", { status: "completed" }), thread("run", { status: "running" })]);
  assert.match(part(out, "n"), /aria-label="Mark as read"/);
  assert.doesNotMatch(part(out, "n"), /aria-label="Settle"|aria-label="Open in Sessions"/);
  assert.doesNotMatch(part(out, "r"), /aria-label="Settle"/);
  assert.match(part(out, "r"), /aria-label="Open in Sessions"/);
});

test("the Running card lists working agents with a shimmer, model and project", () => {
  const threads = [thread("run", { title: "Running one", status: "running", model: "model-x" })];
  const state = baseState(threads);
  state.providers = [{ instanceId: "provider-a", displayName: "Provider A", runtimeModes: [], models: [{ slug: "model-x", name: "Model X", effort: null, speed: null, favorite: null }] }];
  const out = part(render(threads, undefined, state), "r");
  assert.match(out, /run-row working/);
  assert.match(out, /Running one/);
  assert.match(out, /Model X · Project A/);
  assert.match(out, /Running<\/h2><span class="count">1</);
});

test("routine threads stay out of every card", () => {
  assert.doesNotMatch(render([thread("t-routine", { title: "Routine run" })]), /Routine run/);
});

test("Up next says nothing is queued while the tickets load or when there are none", () => {
  assert.match(part(render([]), "u"), /Up next/);
});
