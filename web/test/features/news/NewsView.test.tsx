import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { NewsState } from "../../../../shared/api.ts";
import { ApiProvider } from "../../../src/api/ApiContext.tsx";
import { NewsView } from "../../../src/features/news/NewsView.tsx";
import { NewsSettingsDialog } from "../../../src/features/news/NewsSettingsDialog.tsx";

const task = { id: "t", enabled: true, nextRunAt: "2026-11-08T07:00:00.000Z", lastRunAt: null, lastRunStatus: null, lastRunError: null };
const state = (over: Partial<NewsState> = {}): NewsState => ({ settings: { timeOfDay: "07:00", topics: ["Tech", "AI"], language: "French", modelSelection: null }, task, articles: [], ...over });
const now = new Date("2026-11-07T12:00:00.000Z");
const view = (news: NewsState) =>
  renderToStaticMarkup(
    <ApiProvider value={{} as never}>
      <NewsView news={news} now={now} />
    </ApiProvider>,
  );

test("without a brief the page explains how one arrives", () => {
  assert.match(view(state()), /No brief yet[\s\S]*Run now/);
  assert.match(view(state({ task: null })), /Not scheduled[\s\S]*Open Brief settings/);
});

test("the list shows each brief newest first, and marks the newest open", () => {
  const out = view(state({ articles: [{ date: "2026-11-07", title: "Brief 7 Nov", mtimeMs: 2 }, { date: "2026-11-06", title: "Brief 6 Nov", mtimeMs: 1 }] }));
  assert.ok(out.indexOf("Sat 7 Nov") < out.indexOf("Fri 6 Nov"));
  assert.match(out, /news-item active"[^>]*aria-current="true"[^>]*><span[^>]*>Sat 7 Nov/);
  assert.equal(out.match(/aria-current="true"/g)?.length, 1);
});

test("the article pane has a back button for the phone, and starts on the list", () => {
  const out = view(state({ articles: [{ date: "2026-11-07", title: "Brief 7 Nov", mtimeMs: 2 }] }));
  assert.match(out, /class="news-page"/);
  assert.match(out, /news-back[^>]*>.*Briefs/);
});

test("the settings dialog shows the saved values", () => {
  const out = renderToStaticMarkup(
    <NewsSettingsDialog settings={state().settings} providers={[]} defaults={{ selection: null, runtimeMode: null }} onSave={async () => {}} onClose={() => {}} />,
  );
  assert.match(out, /value="07:00"/);
  assert.match(out, />Tech\nAI</);
  assert.match(out, /value="French"/);
});
