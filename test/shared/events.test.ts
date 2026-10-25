import assert from "node:assert/strict";
import { test } from "bun:test";
import { DASHBOARD_EVENT_TYPES } from "../../shared/events.ts";

// The web subscribes to this list: an event type missing here would be dropped without notice.
test("the event type list names every server event", () => {
  assert.deepEqual([...DASHBOARD_EVENT_TYPES].sort(), ["connection", "modelDefaults", "projects", "providers", "state", "threads"]);
});
