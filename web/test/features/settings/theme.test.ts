import { test } from "bun:test";
import assert from "node:assert/strict";
import { memoryStore } from "../../fixtures.ts";
import { THEME_KEY, loadTheme, parseTheme, resolveTheme, saveTheme } from "../../../src/features/settings/theme.ts";

const store = (initial?: string) => memoryStore(initial === undefined ? {} : { [THEME_KEY]: initial });

test("parseTheme accepts the three settings and falls back to system", () => {
  assert.equal(parseTheme("light"), "light");
  assert.equal(parseTheme("dark"), "dark");
  assert.equal(parseTheme("system"), "system");
  assert.equal(parseTheme(null), "system");
  assert.equal(parseTheme("sepia"), "system");
});

test("resolveTheme follows the OS only for system", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("loadTheme and saveTheme round-trip through storage", () => {
  const s = store();
  assert.equal(loadTheme(s), "system");
  saveTheme(s, "dark");
  assert.equal(s.data.get("t3-dashboard-theme"), "dark");
  assert.equal(loadTheme(s), "dark");
  assert.equal(loadTheme(store("garbage")), "system");
});

test("loadTheme survives a storage that throws", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(loadTheme(broken), "system");
  assert.doesNotThrow(() => saveTheme(broken, "light"));
});
