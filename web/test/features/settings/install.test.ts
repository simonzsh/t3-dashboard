import { test } from "bun:test";
import assert from "node:assert/strict";
import { detectBrowser, installView } from "../../../src/features/settings/install.ts";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/130.0.0.0`;
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";

test("detectBrowser tells Chromium family, Safari and Firefox apart", () => {
  assert.equal(detectBrowser(CHROME), "chromium");
  assert.equal(detectBrowser(EDGE), "chromium");
  assert.equal(detectBrowser(SAFARI), "safari");
  assert.equal(detectBrowser(FIREFOX), "firefox");
  assert.equal(detectBrowser("curl/8.0"), "other");
});

const base = { standalone: false, installed: false, canPrompt: false, browser: "chromium" } as const;

test("installView is installed when running standalone or after appinstalled", () => {
  assert.equal(installView({ ...base, standalone: true, canPrompt: true }), "installed");
  assert.equal(installView({ ...base, installed: true }), "installed");
});

test("installView offers the prompt when the browser gave one", () => {
  assert.equal(installView({ ...base, canPrompt: true }), "prompt");
});

test("installView falls back to manual steps per browser", () => {
  assert.equal(installView(base), "chromium");
  assert.equal(installView({ ...base, browser: "safari" }), "safari");
  assert.equal(installView({ ...base, browser: "firefox" }), "firefox");
  assert.equal(installView({ ...base, browser: "other" }), "other");
});
