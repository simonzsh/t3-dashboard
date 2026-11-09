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
  assert.match(html, /class="segmented" role="radiogroup" aria-label="Update channel"/);
  assert.match(html, /role="radio" aria-checked="true"[^>]*>Main<\/button>/);
  assert.match(html, /Updates stay manual/);
  const busy = renderToStaticMarkup(<UpdateSettings update={{ ...update, updating: true }} onUpdate={() => {}} />);
  assert.match(busy, /role="radiogroup" aria-label="Update channel" aria-disabled="true"/);
  assert.equal(busy.match(/role="radio"[^>]*disabled=""[^>]*tabindex="-1"/g)?.length, 2);
});
