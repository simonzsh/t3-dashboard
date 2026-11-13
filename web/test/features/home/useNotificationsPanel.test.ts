import { test } from "bun:test";
import assert from "node:assert/strict";
import { loadPanelOpen, NOTIFICATIONS_PANEL_KEY, savePanelOpen } from "../../../src/features/home/useNotificationsPanel.ts";
import { memoryStore } from "../../fixtures.ts";

test("the panel is open unless the browser saved it closed", () => {
  const storage = memoryStore();
  assert.equal(loadPanelOpen(storage), true);
  storage.data.set(NOTIFICATIONS_PANEL_KEY, "open");
  assert.equal(loadPanelOpen(storage), true);
  storage.data.set(NOTIFICATIONS_PANEL_KEY, "closed");
  assert.equal(loadPanelOpen(storage), false);
  assert.equal(loadPanelOpen(null), true);
  assert.equal(loadPanelOpen({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }), true);
});

test("the state is saved as open or closed", () => {
  const storage = memoryStore();
  savePanelOpen(storage, false);
  assert.equal(storage.data.get(NOTIFICATIONS_PANEL_KEY), "closed");
  savePanelOpen(storage, true);
  assert.equal(storage.data.get(NOTIFICATIONS_PANEL_KEY), "open");
});
