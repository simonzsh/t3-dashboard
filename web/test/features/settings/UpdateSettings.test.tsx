import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UpdateSettings } from "../../../src/features/settings/UpdateSettings.tsx";
import type { UpdateControl } from "../../../src/features/update/useUpdate.ts";

test("update settings show the saved channel and disable its picker during an installation", () => {
  const update: UpdateControl = {
    status: { channel: "main", current: `main-${"a".repeat(40)}`, latest: null, available: false, canUpdate: true, reason: null, updating: false, error: null },
    updating: false, checking: false, error: null,
    check: async () => {}, setChannel: async () => {}, apply: async () => {},
  };
  const html = renderToStaticMarkup(<UpdateSettings update={update} onUpdate={() => {}} />);
  assert.match(html, /aria-label="Update channel"/);
  assert.match(html, /Main/);
  assert.match(html, /Updates require your confirmation/);
  const busy = renderToStaticMarkup(<UpdateSettings update={{ ...update, updating: true }} onUpdate={() => {}} />);
  assert.match(busy, /<button[^>]*disabled=""[^>]*aria-label="Update channel"|<button[^>]*aria-label="Update channel"[^>]*disabled=""/);
});
