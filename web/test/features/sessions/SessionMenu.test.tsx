import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionMenu, sessionMenuItems, type SessionMenuContext } from "../../../src/features/sessions/SessionMenu.tsx";
import { thread } from "../../fixtures.ts";

const context: SessionMenuContext = { t3EnvironmentId: "env", alert: null, onToggleAlert: () => {} };

test("session menu offers title generation and the native link without unconfigured alerts", () => {
  let calls = 0;
  const items = sessionMenuItems(thread("t"), context, () => { calls++; }, false, () => {});
  assert.deepEqual(items.map((item) => item.label), ["Rename", "Regenerate title", "Open in T3 Code"]);
  items[1]!.onSelect();
  assert.equal(calls, 1);
  assert.equal(items[2]!.disabled, false);
  assert.equal(items[2]!.icon, "t3");
  assert.equal(sessionMenuItems(thread("t"), { ...context, t3EnvironmentId: null }, () => {}, false, () => {}).at(-1)!.disabled, true);
});

test("configured alerts toggle the selected session and show the armed state", () => {
  let id = "";
  const items = sessionMenuItems(thread("t"), { ...context, alert: "armed", onToggleAlert: (value) => { id = value; } }, () => {}, true, () => {});
  assert.equal(items[1]!.disabled, true);
  assert.equal(items[2]!.label, "Turn off phone alert");
  items[2]!.onSelect();
  assert.equal(id, "t");
});

test("the session action trigger is an accessible three-dot menu", () => {
  const html = renderToStaticMarkup(<SessionMenu thread={thread("t", { title: "Example" })} {...context} />);
  assert.match(html, /aria-label="Actions for Example"/);
  assert.match(html, /aria-haspopup="menu"/);
});

test("Rename is the first action and opens its own editor", () => {
  let opened = false;
  const items = sessionMenuItems(thread("t"), context, () => {}, false, () => { opened = true; });
  assert.equal(items[0]!.label, "Rename");
  items[0]!.onSelect();
  assert.equal(opened, true);
});

test("title regeneration stays available during active and waiting runs", () => {
  for (const status of ["running", "waiting", "queued", "completed"]) {
    const current = thread("t", { status, activeRunId: "run-1" });
    const items = sessionMenuItems(current, context, () => {}, false, () => {});
    assert.equal(items.find((item) => item.label === "Regenerate title")!.disabled, false);
    const busy = sessionMenuItems(current, context, () => {}, true, () => {});
    assert.equal(busy.find((item) => item.label === "Generating title…")!.disabled, true);
  }
});
