import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationsCard } from "../../../src/features/home/NotificationsCard.tsx";
import { threadSections } from "../../../src/features/home/sections.ts";
import { thread } from "../../fixtures.ts";

test("notifications directly render the latest 50 including old settled items without settlement controls", () => {
  const threads = Array.from({ length: 60 }, (_, i) => thread(String(i), {
    title: `Result ${i}`,
    settled: true,
    status: "completed",
    lastActivityAt: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
  }));
  const sections = threadSections(threads, { since: "2030-01-01T00:00:00.000Z", seen: {} });
  const html = renderToStaticMarkup(<NotificationsCard
    sections={sections} loading={false} onMarkAllRead={() => {}}
    renderItem={({ thread: t }) => <div key={t.id} data-result={t.id}>{t.title}</div>}
  />);
  assert.equal(html.match(/data-result=/g)?.length, 50);
  assert.match(html, /data-result="59"/);
  assert.match(html, /data-result="10"/);
  assert.doesNotMatch(html, /data-result="9"|See all|Show less|Settle all/);
});
