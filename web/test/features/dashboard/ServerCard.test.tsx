import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ServerStats } from "../../../../shared/api.ts";
import { ServerCard } from "../../../src/features/dashboard/ServerCard.tsx";
import type { ReadState } from "../../../src/features/dashboard/pollRead.ts";

const GIB = 1024 ** 3;
const stats = (over: Partial<ServerStats> = {}): ServerStats => ({
  host: "devbox",
  os: "Linux",
  uptimeSeconds: 19 * 86_400,
  cpu: { usedPercent: 22.6, cores: 4 },
  memory: { usedBytes: 3.9 * GIB, totalBytes: 15.6 * GIB, usedPercent: 25 },
  disk: { path: "/home/simon", usedBytes: 168 * GIB, totalBytes: 211 * GIB, usedPercent: 80 },
  readAt: "2026-11-06T12:00:00.000Z",
  ...over,
});
const state = (over: Partial<ReadState<ServerStats>> = {}): ReadState<ServerStats> => ({ value: stats(), error: null, loading: false, refresh: () => {}, ...over });
const NOW = new Date("2026-11-06T12:03:00.000Z");
const render = (over: Partial<ReadState<ServerStats>> = {}) => renderToStaticMarkup(<ServerCard state={state(over)} now={NOW} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "");

test("the card is titled Server and shows three tiles", () => {
  const out = render();
  assert.match(out, /<h2 id="dashboard-server-head">Server<\/h2>/);
  assert.equal(out.match(/class="stat-tile"/g)?.length, 3);
  for (const label of ["CPU", "Memory", "Disk"]) assert.match(out, new RegExp(`class="stat-label">${label}<`));
});

test("each tile shows a rounded percent, its caption and a meter", () => {
  const out = render();
  assert.match(out, /class="stat-value">23%</);
  assert.match(out, /class="stat-caption">4 cores</);
  assert.match(out, /class="stat-value">25%</);
  assert.match(out, /class="stat-caption">3\.9 of 15\.6 GB</);
  assert.match(out, /class="stat-caption">168 of 211 GB<span class="stat-more"> · \/home\/simon<\/span>/);
  assert.equal(out.match(/role="img"/g)?.length, 3);
  assert.match(out, /aria-label="Memory: 25% used, 3\.9 of 15\.6 GB"/);
});

test("the meters follow the severity steps", () => {
  const out = render({ value: stats({ cpu: { usedPercent: 92, cores: 4 }, disk: { path: "/h", usedBytes: 1, totalBytes: 2, usedPercent: 80 } }) });
  assert.match(out, /class="meter danger"/);
  assert.match(out, /class="meter warn"/);
  assert.match(out, /class="meter ok"/);
});

test("one core reads in the singular", () => {
  assert.match(render({ value: stats({ cpu: { usedPercent: 5, cores: 1 } }) }), /class="stat-caption">1 core</);
});

test("an unknown CPU percent shows a dash and no meter", () => {
  const out = render({ value: stats({ cpu: { usedPercent: null, cores: 4 } }) });
  assert.match(out, /CPU<\/span><span class="stat-value">—<\/span><span class="stat-caption">4 cores/);
  assert.equal(out.match(/role="img"/g)?.length, 2);
});

test("a disk that cannot be read shows a dash and a note", () => {
  const out = render({ value: stats({ disk: null }) });
  assert.match(out, /Disk<\/span><span class="stat-value">—<\/span><span class="stat-caption">Not available/);
  assert.equal(out.match(/role="img"/g)?.length, 2);
});

test("the host, the OS and the uptime sit next to the title, with a tooltip", () => {
  const out = render();
  assert.match(out, /<h2 id="dashboard-server-head">Server<\/h2><span class="card-note" data-tooltip="devbox · Linux · up 19 d"[^>]*>devbox · Linux · up 19 d<\/span>/);
});

test("the head shows how old the read is", () => {
  assert.match(text(render()), /Updated 3 min ago/);
});

test("before the first answer there is a skeleton with three tiles; a failed first read shows the error", () => {
  const loading = render({ value: null, loading: true });
  assert.match(loading, /role="status" aria-busy="true" aria-label="Loading server stats"/);
  assert.equal(loading.match(/class="stat-tile"/g)?.length, 3);
  const failed = render({ value: null, error: "boom" });
  assert.match(failed, /<p class="dashboard-note error" role="alert">boom<\/p>/);
  assert.doesNotMatch(failed, /stat-tile/);
});

test("a failed refresh keeps the tiles and says so", () => {
  const out = render({ error: "boom" });
  assert.match(out, /class="stat-value">23%</);
  assert.match(text(out), /Could not refresh server stats\. boom/);
});

test("a refresh button reads again, and spins while it loads", () => {
  const idle = render();
  assert.match(idle, /<button[^>]*aria-label="Refresh server stats"/);
  assert.doesNotMatch(idle, /spinning/);
  const busy = render({ loading: true });
  assert.match(busy, /<button[^>]*disabled=""[^>]*aria-label="Refresh server stats"/);
  assert.match(busy, /icon spinning/);
});

test("a Clear caches button sits in the head on Linux and macOS and is hidden on Windows", () => {
  assert.match(render(), /<button[^>]*aria-label="Clear caches"/);
  assert.match(render({ value: stats({ os: "macOS" }) }), /aria-label="Clear caches"/);
  assert.doesNotMatch(render({ value: stats({ os: "Windows" }) }), /Clear caches/);
  assert.doesNotMatch(render({ value: null, loading: true }), /Clear caches/);
});

test("the cleanup dialog is closed until the button is clicked", () => {
  assert.doesNotMatch(render(), /role="dialog"/);
});
