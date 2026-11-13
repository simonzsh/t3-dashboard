import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsRowPending } from "../../../src/features/settings/SettingsRowPending.tsx";

test("a pending settings row keeps its title and shows the inline loader", () => {
  const html = renderToStaticMarkup(<SettingsRowPending title="Linear" />);
  assert.match(html, /<span>Linear<\/span>/);
  assert.match(html, /class="loader inline" role="status" aria-label="Loading Linear"/);
});

test("a settings row that failed to load shows the error in place of the loader", () => {
  const html = renderToStaticMarkup(<SettingsRowPending title="Alerts" error="Could not load" />);
  assert.match(html, /Could not load/);
  assert.doesNotMatch(html, /loader/);
});
