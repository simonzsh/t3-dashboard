import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { BoardResult, LinearInboxItem, LinearIssue } from "../../../../shared/api.ts";
import { LinearCard } from "../../../src/features/dashboard/LinearCard.tsx";
import { thread } from "../../fixtures.ts";

// Local noon, so the local day is the same in every time zone.
const NOW = new Date(2026, 10, 6, 12, 0, 0);
const day = (offset: number) => {
  const d = new Date(2026, 10, 6 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const issue = (identifier: string, over: Partial<LinearIssue> = {}): LinearIssue => ({
  id: `id-${identifier}`,
  identifier,
  title: `Issue ${identifier}`,
  url: `https://linear.example.invalid/${identifier}`,
  state: { name: "Todo", type: "unstarted", color: "#fff" },
  priority: 3,
  priorityLabel: "Medium",
  project: null,
  team: { key: "ABC", name: "Team" },
  updatedAt: "2026-11-05T10:00:00.000Z",
  dueDate: null,
  ...over,
});
const mention = (n: number, over: Partial<LinearInboxItem> = {}): LinearInboxItem => ({
  id: `n${n}`,
  kind: "mention",
  createdAt: new Date(2026, 10, 6, 11, 0, 0).toISOString(),
  actor: "Robin",
  url: `https://linear.example.invalid/IN-${n}`,
  issue: { id: `id-IN-${n}`, identifier: `IN-${n}`, title: `Issue IN-${n}`, url: `https://linear.example.invalid/IN-${n}`, priority: 3 },
  ...over,
});
const board = (over: Partial<BoardResult> = {}): BoardResult => ({ configured: true, ok: true, error: null, issues: [], readAt: new Date(2026, 10, 6, 11, 55, 0).toISOString(), inbox: [], inboxError: null, ...over });
const render = (value: BoardResult, over: { threads?: ReturnType<typeof thread>[]; started?: string[] } = {}) =>
  renderToStaticMarkup(
    <LinearCard
      board={value}
      now={NOW}
      loading={false}
      threads={over.threads ?? []}
      started={new Set(over.started ?? [])}
      onRefresh={() => {}}
      projects={[]}
      providers={[]}
      modelDefaults={{} as never}
      onOpen={() => {}}
      onStarted={() => {}}
    />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the card is titled Linear, with the update time and a refresh button", () => {
  const out = render(board());
  assert.match(out, /<section class="dashboard-card" aria-labelledby="linear-head">/);
  assert.match(out, /<h2 id="linear-head">Linear<\/h2>/);
  assert.match(text(out), /Updated 5 min ago/);
  assert.ok(out.indexOf("Updated 5 min ago") < out.indexOf('aria-label="Refresh"'));
});

test("four counters show the figures of the board", () => {
  const out = render(board({ issues: [issue("A-1", { priority: 1 }), issue("A-2", { dueDate: day(-1) })], inbox: [mention(1), mention(2, { kind: "assigned" })] }));
  const counters = [...out.matchAll(/<div class="glance-counter[^"]*"><span class="stat-label">([^<]+)<\/span><span class="glance-value">([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(counters, [["Urgent", "1"], ["Assigned", "1"], ["Mentions", "1"], ["Due", "1"]]);
});

test("the Due counter turns to the error tone only when an issue is overdue", () => {
  assert.match(render(board({ issues: [issue("A-1", { dueDate: day(-2) })] })), /class="glance-counter danger"/);
  assert.match(text(render(board({ issues: [issue("A-1", { dueDate: day(-2) })] }))), /1 overdue/);
  assert.doesNotMatch(render(board({ issues: [issue("A-1", { dueDate: day(1) })] })), /glance-counter danger/);
});

test("a failed inbox shows dashes for its counters and a note, and keeps the rest", () => {
  const out = render(board({ issues: [issue("A-1", { priority: 1 })], inboxError: "boom" }));
  assert.match(out, /Assigned<\/span><span class="glance-value">–</);
  assert.match(out, /Mentions<\/span><span class="glance-value">–</);
  assert.match(out, /Urgent<\/span><span class="glance-value">1</);
  assert.match(text(out), /Inbox not available/);
});

test("feed rows link to the issue or the comment, with actor and age", () => {
  const out = render(board({ inbox: [mention(1, { kind: "comment-mention", url: "https://linear.example.invalid/IN-1#comment-7" })] }));
  assert.match(out, /<a [^>]*href="https:\/\/linear\.example\.invalid\/IN-1#comment-7"[^>]*target="_blank"[^>]*rel="noreferrer"/);
  assert.match(text(out), /IN-1 Issue IN-1/);
  assert.match(text(out), /Robin · 1 h ago/);
});

test("due rows read overdue N d and due in N d", () => {
  const out = text(render(board({ issues: [issue("O-1", { dueDate: day(-2) }), issue("D-1", { dueDate: day(1) }), issue("D-0", { dueDate: day(0) })] })));
  assert.match(out, /overdue 2 d/);
  assert.match(out, /due in 1 d/);
  assert.match(out, /due today/);
});

test("the feed has at most five rows", () => {
  const out = render(board({ issues: Array.from({ length: 8 }, (_, i) => issue(`P-${i}`, { priority: 1 })) }));
  assert.equal(out.match(/class="glance-row"/g)?.length, 5);
});

test("the assign button shows only on an issue of the board with no agent yet", () => {
  const inbox = [mention(1), mention(2), mention(3), mention(4)];
  const issues = [issue("IN-1"), issue("IN-2"), issue("IN-3")];
  const out = render(board({ issues, inbox }), { threads: [thread("t", { title: "IN-2 work" })], started: ["id-IN-3"] });
  const rows = out.split('class="glance-row"').slice(1);
  const withButton = rows.filter((r) => r.includes('aria-label="Assign to an agent"')).map((r) => text(r).match(/IN-\d/)?.[0]);
  assert.deepEqual(withButton, ["IN-1"]);
});

test("a read that failed shows the error and a retry button instead of the counters", () => {
  const out = render(board({ ok: false, error: "Linear is unreachable." }));
  assert.match(text(out), /Linear could not be read: Linear is unreachable\./);
  assert.match(out, />Retry</);
  assert.doesNotMatch(out, /glance-counter/);
});

test("with nothing to show the card says all clear", () => {
  assert.match(text(render(board())), /All clear\./);
  assert.doesNotMatch(text(render(board({ issues: [issue("A-1", { priority: 1 })] }))), /All clear/);
});

test("no relaunch list, no Up next title and no setup card", () => {
  const out = text(render(board({ issues: [issue("A-1", { priority: 1 })] })));
  assert.doesNotMatch(out, /To relaunch|Up next|Connect Linear/);
});
