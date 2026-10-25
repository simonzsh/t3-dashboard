import test from "node:test";
import assert from "node:assert/strict";
import { matchShortcut, type KeyInfo } from "../src/shortcuts.ts";

const press = (key: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, ...over });

test("plain keys map to actions", () => {
  assert.equal(matchShortcut(press("1"), false), "agents");
  assert.equal(matchShortcut(press("2"), false), "board");
  assert.equal(matchShortcut(press("n"), false), "new-agent");
  assert.equal(matchShortcut(press("N"), false), "new-agent");
  assert.equal(matchShortcut(press(","), false), "settings");
  assert.equal(matchShortcut(press("x"), false), null);
});

test("modifiers disable shortcuts", () => {
  for (const m of ["ctrlKey", "metaKey", "altKey"] as const) assert.equal(matchShortcut(press("n", { [m]: true }), false), null, m);
});

test("typing targets disable shortcuts", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(matchShortcut(press("1", { target: { tagName, isContentEditable: false } }), false), null, tagName);
  assert.equal(matchShortcut(press("1", { target: { tagName: "DIV", isContentEditable: true } }), false), null);
  assert.equal(matchShortcut(press("1", { target: { tagName: "BUTTON", isContentEditable: false } }), false), "agents");
});

test("an open dialog disables shortcuts", () => {
  assert.equal(matchShortcut(press("n"), true), null);
});
