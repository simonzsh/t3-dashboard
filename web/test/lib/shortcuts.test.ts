import { test } from "bun:test";
import assert from "node:assert/strict";
import { matchShortcut, type KeyInfo } from "../../src/lib/shortcuts.ts";

const press = (key: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, ...over });

test("plain keys map to actions", () => {
  assert.equal(matchShortcut(press("1"), false), "agents");
  assert.equal(matchShortcut(press("2"), false), "desk");
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

test("3 opens the Desk from any tab", () => {
  assert.equal(matchShortcut(press("3"), false), "board");
  assert.equal(matchShortcut(press("2"), false, true), "desk");
});

test("desk keys only work on the Desk", () => {
  assert.equal(matchShortcut(press("x"), false, true), "close-window");
  assert.equal(matchShortcut(press("F"), false, true), "toggle-fullscreen");
  assert.equal(matchShortcut(press("m"), false, true), "minimize-window");
  assert.equal(matchShortcut(press("Escape"), false, true), "unmaximize");
  assert.equal(matchShortcut(press("m"), false), null);
  assert.equal(matchShortcut(press("f"), false), null);
  assert.equal(matchShortcut(press("Escape"), false), null);
});

test("Alt+1 to Alt+6 focus a desk window", () => {
  assert.equal(matchShortcut(press("1", { altKey: true }), false, true), "window-1");
  assert.equal(matchShortcut(press("¡", { altKey: true, code: "Digit6" }), false, true), "window-6");
  assert.equal(matchShortcut(press("7", { altKey: true, code: "Digit7" }), false, true), null);
  assert.equal(matchShortcut(press("1", { altKey: true }), false), null);
  assert.equal(matchShortcut(press("1", { altKey: true, ctrlKey: true }), false, true), null);
  assert.equal(matchShortcut(press("1", { altKey: true, target: { tagName: "TEXTAREA", isContentEditable: false } }), false, true), null);
  assert.equal(matchShortcut(press("1", { altKey: true }), true, true), null);
});

test("Ctrl+K and Cmd+K open the switcher, even while typing or with a dialog open", () => {
  const typing = { tagName: "TEXTAREA", isContentEditable: false };
  for (const m of ["ctrlKey", "metaKey"] as const) {
    assert.equal(matchShortcut(press("k", { [m]: true }), false), "switcher", m);
    assert.equal(matchShortcut(press("K", { [m]: true }), false), "switcher", m);
    assert.equal(matchShortcut(press("k", { [m]: true, target: typing }), false), "switcher", m);
    assert.equal(matchShortcut(press("k", { [m]: true }), true), "switcher", m);
  }
  assert.equal(matchShortcut(press("k", { ctrlKey: true, target: { tagName: "INPUT", isContentEditable: false } }), false), "switcher");
});

test("a bare K and Ctrl+Alt+K do not open the switcher", () => {
  assert.equal(matchShortcut(press("k"), false), null);
  assert.equal(matchShortcut(press("k", { ctrlKey: true, altKey: true }), false), null);
  assert.equal(matchShortcut(press("n", { ctrlKey: true }), false), null);
});
