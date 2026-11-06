import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACCENTS, ACCENT_KEY, DEFAULT_ACCENT, faviconSvg, loadAccent, parseAccent, saveAccent } from "../../../src/features/settings/accent.ts";

test("an unknown or missing accent falls back to blue", () => {
  assert.equal(parseAccent("green"), "green");
  assert.equal(parseAccent("teal"), DEFAULT_ACCENT);
  assert.equal(parseAccent(null), "blue");
});

test("the accent survives a reload, and a throwing storage does not break it", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  saveAccent(storage, "purple");
  assert.equal(store.get(ACCENT_KEY), "purple");
  assert.equal(loadAccent(storage), "purple");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
  assert.equal(loadAccent(broken), "blue");
  saveAccent(broken, "red");
});

test("every accent but blue has a light and a dark rule in styles.css, and index.html knows them all", () => {
  const css = readFileSync(new URL("../../../src/styles.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
  for (const a of ACCENTS) {
    assert.match(html, new RegExp(`\\b${a.id}\\b`));
    if (a.id === "blue") continue;
    assert.ok(css.includes(`:root[data-accent="${a.id}"] { --accent: ${a.light};`), a.id);
    assert.ok(css.includes(`:root[data-theme="dark"][data-accent="${a.id}"] { --accent: ${a.dark};`), a.id);
  }
});

test("the tab icon is the logo in the accent color", () => {
  const url = faviconSvg("#16a34a");
  assert.ok(url.startsWith("data:image/svg+xml,"));
  assert.equal(decodeURIComponent(url).match(/fill='#16a34a'/g)?.length, 4);
});
