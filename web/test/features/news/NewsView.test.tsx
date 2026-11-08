import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { NewsState } from "../../../../shared/api.ts";
import { ApiProvider } from "../../../src/api/ApiContext.tsx";
import { NewsView } from "../../../src/features/news/NewsView.tsx";
import { NewsSettingsDialog } from "../../../src/features/news/NewsSettingsDialog.tsx";

const task = { id: "t", enabled: true, nextRunAt: "2026-11-08T07:00:00.000Z", lastRunAt: null, lastRunStatus: null, lastRunError: null };
const state = (over: Partial<NewsState> = {}): NewsState => ({ settings: { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", language: "French", modelSelection: null }, task, articles: [], running: null, ...over });
const now = new Date("2026-11-07T12:00:00.000Z");
const view = (news: NewsState, writing = false, compact = false) =>
  renderToStaticMarkup(
    <ApiProvider value={{} as never}>
      <NewsView news={news} writing={writing} now={now} compact={compact} seen={null} onRead={() => {}} onOpenThread={() => {}} />
    </ApiProvider>,
  );

test("without news the page explains how one arrives", () => {
  assert.match(view(state()), /No news yet[\s\S]*Run now/);
  const empty = view(state({ task: null }));
  assert.doesNotMatch(empty, /Not scheduled/);
  assert.match(empty, /No news yet[\s\S]*Open News settings/);
});

test("the list shows each article newest first, and marks the newest open", () => {
  const out = view(state({ articles: [{ date: "2026-11-07", title: "News 7 Nov", mtimeMs: 2 }, { date: "2026-11-06", title: "News 6 Nov", mtimeMs: 1 }] }));
  assert.ok(out.indexOf("Sat 7 Nov") < out.indexOf("Fri 6 Nov"));
  assert.match(out, /news-item active"[^>]*aria-current="true"[^>]*>(<span[^>]*>)+Sat 7 Nov/);
  assert.equal(out.match(/aria-current="true"/g)?.length, 1);
});

test("the article pane has a back button for the phone, and starts on the list", () => {
  const out = view(state({ articles: [{ date: "2026-11-07", title: "News 7 Nov", mtimeMs: 2 }] }));
  assert.match(out, /class="news-page"/);
  assert.match(out, /news-back[^>]*>.*News/);
});

test("the settings dialog shows the saved values", () => {
  const out = renderToStaticMarkup(
    <NewsSettingsDialog settings={state().settings} providers={[]} defaults={{ selection: null, runtimeMode: null }} onSave={async () => {}} onClose={() => {}} />,
  );
  assert.match(out, /value="07:00"/);
  assert.doesNotMatch(out, /topic/i);
  assert.ok(!out.includes("<textarea"));
  assert.match(out, /aria-label="Language"/);
  assert.match(out, /French/);
  assert.ok(!out.includes('value="French"'));
  assert.match(out, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Automatic generation"/);
  assert.match(out, /runs every day/);
  assert.doesNotMatch(out, /aria-label="Weekday"/);
  assert.doesNotMatch(out, /<fieldset[^>]*disabled/);
});

test("the settings dialog shows the weekday of a weekly news and the off state", () => {
  const settings = { ...state().settings, enabled: false, frequency: "weekly" as const, weekday: 0 };
  const out = renderToStaticMarkup(
    <NewsSettingsDialog settings={settings} providers={[]} defaults={{ selection: null, runtimeMode: null }} onSave={async () => {}} onClose={() => {}} />,
  );
  assert.match(out, /aria-checked="false"[^>]*aria-label="Automatic generation"/);
  assert.match(out, /aria-label="Weekday"/);
  assert.match(out, /Sunday/);
  assert.match(out, /every Sunday/);
  // Off: the schedule controls are locked; the language and model stay editable.
  assert.match(out, /<fieldset class="news-schedule" disabled=""/);
});


test("a run in progress shows an item with a spinner and a link to the thread", () => {
  const out = view(state({ articles: [{ date: "2026-11-07", title: "News 7 Nov", mtimeMs: 2 }], running: { threadId: "t-1", startedAt: null } }), true);
  assert.ok(out.indexOf("Writing the article…") < out.indexOf("Sat 7 Nov"));
  assert.match(out, /news-item writing[\s\S]*role="status"[\s\S]*Open session/);
  assert.match(out, /Writing the article now/);
  assert.doesNotMatch(view(state({ articles: [{ date: "2026-11-07", title: "N", mtimeMs: 2 }] })), /Writing the article/);
});

test("a run just started shows the item without a link, even with no article yet", () => {
  const out = view(state(), true);
  assert.match(out, /Writing the article…/);
  assert.doesNotMatch(out, /Open session/);
});

test("an unread article shows the notification dot; a read one does not", () => {
  const articles = [
    { date: "2026-11-08", title: "News — 2026-11-08", mtimeMs: Date.parse("2026-11-08T07:05:00.000Z") },
    { date: "2026-11-07", title: "News — 2026-11-07", mtimeMs: Date.parse("2026-11-07T07:05:00.000Z") },
  ];
  const seen = { since: "2026-11-01T00:00:00.000Z", seen: { "news:2026-11-07": "2026-11-07T07:05:00.000Z" } };
  const out = renderToStaticMarkup(
    <ApiProvider value={{} as never}>
      <NewsView news={state({ articles })} writing={false} now={now} compact={false} seen={seen} onRead={() => {}} onOpenThread={() => {}} />
    </ApiProvider>,
  );
  assert.equal(out.match(/class="notif-dot"/g)?.length, 1);
});

test("on a phone the list marks no article open: the article is not on screen", () => {
  const out = view(state({ articles: [{ date: "2026-11-07", title: "News 7 Nov", mtimeMs: 2 }] }), false, true);
  assert.doesNotMatch(out, /news-item active/);
  assert.doesNotMatch(out, /aria-current="true"/);
});
