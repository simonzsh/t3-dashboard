import { test } from "bun:test";
import assert from "node:assert/strict";
import { detectBrowser, installSteps } from "../../../src/features/settings/install.ts";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/130.0.0.0`;
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";

test("detectBrowser tells Chrome from other Chromium browsers by its brand", () => {
  assert.equal(detectBrowser({ userAgent: CHROME, brands: ["Chromium", "Google Chrome"] }), "chrome");
  assert.equal(detectBrowser({ userAgent: CHROME, brands: ["Chromium"] }), "other", "Dia, Arc: no Google Chrome brand");
  assert.equal(detectBrowser({ userAgent: EDGE }), "edge");
});

test("detectBrowser finds Safari, Firefox and mobile devices", () => {
  assert.equal(detectBrowser({ userAgent: SAFARI }), "safari");
  assert.equal(detectBrowser({ userAgent: SAFARI, touchPoints: 5 }), "ios", "iPadOS Safari poses as a Mac");
  assert.equal(detectBrowser({ userAgent: IPHONE_CHROME }), "ios");
  assert.equal(detectBrowser({ userAgent: ANDROID }), "android");
  assert.equal(detectBrowser({ userAgent: FIREFOX }), "firefox");
});

test("installSteps gives one short answer per browser", () => {
  assert.deepEqual(installSteps("ios", false), ["Tap the Share button.", "Choose Add to Home Screen."]);
  assert.deepEqual(installSteps("safari", true), ["In the menu bar, choose File > Add to Dock."]);
  assert.deepEqual(installSteps("other", true), ["This browser cannot install web apps. Open the dashboard in Safari."]);
  assert.deepEqual(installSteps("other", false), ["This browser cannot install web apps. Open the dashboard in Chrome or Edge."]);
});
