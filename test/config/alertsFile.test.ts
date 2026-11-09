import assert from "node:assert/strict";
import { test } from "bun:test";
import { ALERTS_ARMED_MAX, NTFY_DEFAULT_SERVER } from "../../shared/alerts.ts";
import { alertsText, readAlerts } from "../../src/config/alertsFile.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/alerts.json";
const entry = (threadId: string) => ({ threadId, clickUrl: `https://dash.example/#/sessions/${threadId}`, armedAt: "2026-01-01T00:00:00.000Z" });
const read = (content: unknown) => readAlerts(FILE, files({ [FILE]: typeof content === "string" ? content : JSON.stringify(content) }));
const NOT_SET_UP = { server: NTFY_DEFAULT_SERVER, topic: null, armed: [] };

test("a missing or broken file means not set up and nothing armed", () => {
  assert.deepEqual(readAlerts(FILE, files({})), NOT_SET_UP);
  assert.deepEqual(read("{oops"), NOT_SET_UP);
  assert.deepEqual(read([1, 2]), NOT_SET_UP);
});

test("what alertsText writes reads back the same, with a version", () => {
  const file = { server: "https://ntfy.example", topic: "t3-dashboard-abc", armed: [entry("a"), entry("b")] };
  const text = alertsText(file);
  assert.ok(text.endsWith("}\n"));
  assert.equal(JSON.parse(text).version, 1);
  assert.deepEqual(read(text), file);
});

test("each field falls back alone", () => {
  assert.deepEqual(read({ server: "nope", topic: "good_topic", armed: [entry("a")] }), { server: NTFY_DEFAULT_SERVER, topic: "good_topic", armed: [entry("a")] });
  assert.deepEqual(read({ server: "https://ntfy.example/", topic: "bad topic!", armed: [entry("a")] }), { server: "https://ntfy.example", topic: null, armed: [] });
});

test("bad armed entries are dropped, and a repeated thread keeps its first entry", () => {
  const armed = [entry("a"), { threadId: "", clickUrl: "https://x.example/", armedAt: "t" }, { ...entry("b"), clickUrl: "javascript:1" }, { ...entry("c"), armedAt: 5 }, "junk", entry("a"), entry("d")];
  assert.deepEqual(read({ topic: "tp", armed }).armed.map((a) => a.threadId), ["a", "d"]);
});

test("the armed list is capped", () => {
  const armed = Array.from({ length: ALERTS_ARMED_MAX + 5 }, (_, i) => entry(`t${i}`));
  assert.equal(read({ topic: "tp", armed }).armed.length, ALERTS_ARMED_MAX);
});
