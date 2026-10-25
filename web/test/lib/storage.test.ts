import { afterEach, test } from "bun:test";
import assert from "node:assert/strict";
import { loadBackground, saveBackground } from "../../src/features/desk/deskBackground.ts";
import { EMPTY_DESK, loadDesk, saveDesk } from "../../src/features/desk/desk.ts";
import { browserStorage } from "../../src/lib/storage.ts";
import { loadTheme, saveTheme } from "../../src/features/settings/theme.ts";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test("browserStorage returns null when reading the localStorage global throws", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  assert.equal(browserStorage(), null);
});

test("theme, desk and background fall back without storage", () => {
  assert.equal(loadTheme(null), "system");
  assert.doesNotThrow(() => saveTheme(null, "dark"));
  assert.deepEqual(loadDesk(null), EMPTY_DESK);
  assert.doesNotThrow(() => saveDesk(null, EMPTY_DESK));
  assert.deepEqual(loadBackground(null), { kind: "none" });
  assert.match(saveBackground(null, { kind: "none" }) ?? "", /Could not save/);
});
