import { test } from "bun:test";
import assert from "node:assert/strict";
import { detectDevice, phoneStep } from "../../../src/features/settings/install.ts";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";

test("detectDevice finds iPhone, iPadOS Safari and Android", () => {
  assert.equal(detectDevice({ userAgent: IPHONE_CHROME }), "ios");
  assert.equal(detectDevice({ userAgent: SAFARI, touchPoints: 5 }), "ios", "iPadOS Safari poses as a Mac");
  assert.equal(detectDevice({ userAgent: ANDROID }), "android");
});

test("detectDevice calls every other browser a desktop", () => {
  assert.equal(detectDevice({ userAgent: SAFARI }), "desktop");
  assert.equal(detectDevice({ userAgent: CHROME }), "desktop");
  assert.equal(detectDevice({ userAgent: FIREFOX }), "desktop");
});

test("phoneStep gives the home screen step per phone", () => {
  assert.equal(phoneStep("ios"), "Tap Share, then Add to Home Screen.");
  assert.equal(phoneStep("android"), "Open the browser menu (⋮), then choose Add to Home screen.");
});
