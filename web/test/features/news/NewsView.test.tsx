import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { NewsState } from "../../../../shared/api.ts";
import { ApiProvider } from "../../../src/api/ApiContext.tsx";
import { NewsView } from "../../../src/features/news/NewsView.tsx";
import { NewsSettingsDialog } from "../../../src/features/news/NewsSettingsDialog.tsx";

const task = { id: "t", enabled: true, nextRunAt: "2026-11-08T07:00:00.000Z", lastRunAt: null, lastRunStatus: null, lastRunError: null };
const state = (over: Partial<NewsState> = {}): NewsState => ({ settings: { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", topics: ["Tech", "AI"], language: "French", modelSelection: null }, task, articles: [], ...over });
const now = new Date("2026-11-07T12:00:00.000Z");
const view = (news: NewsState) =>
  renderToStaticMarkup(
    <ApiProvider value={{} as never}>
      <NewsView news={news} now={now} compact={false} onRead={() => {}} />
    </ApiProvider>,
  );

test("without news the page explains how one arrives", () => {
  assert.match(view(state()), /No news yet[\s\S]*Run now/);
  assert.match(view(state({ task: null })), /Not scheduled[\s\S]*Open News settings/);
});

test("the list shows each article newest first, and marks the newest open", () => {
  const out = view(state({ articles: [{ date: "2026-11-07", title: "News 7 Nov", mtimeMs: 2 }, { date: "2026-11-06", title: "News 6 Nov", mtimeMs: 1 }] }));
  assert.ok(out.indexOf("Sat 7 Nov") < out.indexOf("Fri 6 Nov"));
  assert.match(out, /news-item active"[^>]*aria-current="true"[^>]*><span[^>]*>Sat 7 Nov/);
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
  assert.match(out, /role="group" aria-label="Topics"/);
  for (const topic of ["AI", "Software development", "Tech", "Hardware &amp; chips"]) assert.ok(out.includes(`<span>${topic}</span>`), topic);
  assert.ok(!out.includes("<textarea"));
  assert.match(out, /checked=""[^>]*\/><span>AI<\/span>/);
  assert.match(out, /checked=""[^>]*\/><span>Tech<\/span>/);
  assert.doesNotMatch(out, /checked=""[^>]*\/><span>Security<\/span>/);
  assert.match(out, /value="French"/);
  assert.match(out, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Automatic generation"/);
  assert.match(out, /runs every day/);
  assert.doesNotMatch(out, /aria-label="Weekday"/);
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
});

test("a saved custom topic shows checked after the presets", () => {
  const settings = { ...state().settings, topics: ["Quantum", "AI"] };
  const out = renderToStaticMarkup(
    <NewsSettingsDialog settings={settings} providers={[]} defaults={{ selection: null, runtimeMode: null }} onSave={async () => {}} onClose={() => {}} />,
  );
  assert.match(out, /checked=""[^>]*\/><span>Quantum<\/span>/);
  assert.ok(out.indexOf("<span>Hardware &amp; chips</span>") < out.indexOf("<span>Quantum</span>"));
  assert.match(out, /aria-label="Add a topic"/);
});
