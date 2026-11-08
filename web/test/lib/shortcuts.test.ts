import { test } from "bun:test";
import assert from "node:assert/strict";
import { matchShortcut, startsTyping, type KeyInfo } from "../../src/lib/shortcuts.ts";

const press = (key: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, ...over });
const ctrl = (key: string, over: Partial<KeyInfo> = {}) => press(key, { ctrlKey: true, ...over });
const typing = { tagName: "TEXTAREA", isContentEditable: false };

test("Ctrl+key maps to the actions", () => {
  assert.equal(matchShortcut(ctrl("1"), false), "dashboard");
  assert.equal(matchShortcut(ctrl("2"), false), "sessions");
  assert.equal(matchShortcut(ctrl("3"), false), "automations");
  assert.equal(matchShortcut(ctrl("4"), false), "news");
  assert.equal(matchShortcut(ctrl("n"), false), "new-session");
  assert.equal(matchShortcut(ctrl("N"), false), "new-session");
  assert.equal(matchShortcut(ctrl(","), false), "settings");
  assert.equal(matchShortcut(ctrl("b"), false), "toggle-sidebar");
  assert.equal(matchShortcut(ctrl("N", { shiftKey: true }), false), "new-automation");
});

test("Ctrl shortcuts work while typing in a field", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(matchShortcut(ctrl("1", { target: { tagName, isContentEditable: false } }), false), "dashboard", tagName);
  assert.equal(matchShortcut(ctrl("n", { target: { tagName: "DIV", isContentEditable: true } }), false), "new-session");
  assert.equal(matchShortcut(ctrl("x", { target: typing }), false, true), "close-window");
});

test("plain keys and Cmd do not trigger the shortcuts", () => {
  for (const key of ["1", "2", "3", "4", "n", ","]) assert.equal(matchShortcut(press(key), false), null, key);
  assert.equal(matchShortcut(press("N", { shiftKey: true }), false), null);
  assert.equal(matchShortcut(press("n", { metaKey: true }), false), null);
  assert.equal(matchShortcut(press("1", { metaKey: true }), false), null);
  assert.equal(matchShortcut(press("x"), false, true), null);
  assert.equal(matchShortcut(ctrl("s"), false), null, "the composer owns Ctrl+S");
});

test("an open dialog disables shortcuts", () => {
  assert.equal(matchShortcut(ctrl("n"), true), null);
  assert.equal(matchShortcut(press("Escape"), true, true), null);
});

test("Ctrl+X and F act on the sessions only, and Ctrl+M does nothing", () => {
  assert.equal(matchShortcut(ctrl("x"), false, true), "close-window");
  assert.equal(matchShortcut(ctrl("F"), false, true), "toggle-fullscreen");
  assert.equal(matchShortcut(ctrl("m"), false, true), null);
  assert.equal(matchShortcut(ctrl("f"), false), null);
});

test("Escape and the arrows stay plain keys, on the sessions and outside fields", () => {
  assert.equal(matchShortcut(press("Escape"), false, true), "unmaximize");
  assert.equal(matchShortcut(press("ArrowLeft"), false, true), "focus-left");
  assert.equal(matchShortcut(press("ArrowRight"), false, true), "focus-right");
  assert.equal(matchShortcut(press("ArrowUp"), false, true), "focus-up");
  assert.equal(matchShortcut(press("ArrowDown"), false, true), "focus-down");
  assert.equal(matchShortcut(press("Escape"), false), null);
  assert.equal(matchShortcut(press("ArrowLeft", { target: typing }), false, true), null);
  assert.equal(matchShortcut(press("Escape", { target: typing }), false, true), null);
});

test("Ctrl+Alt+digit is no shortcut: AltGr types a character", () => {
  assert.equal(matchShortcut(ctrl("1", { altKey: true }), false, true), null);
  assert.equal(matchShortcut(ctrl("7", { altKey: true }), false), null);
});

test("Ctrl+K and Cmd+K open the switcher, even while typing or with a dialog open", () => {
  for (const m of ["ctrlKey", "metaKey"] as const) {
    assert.equal(matchShortcut(press("k", { [m]: true }), false), "switcher", m);
    assert.equal(matchShortcut(press("K", { [m]: true }), false), "switcher", m);
    assert.equal(matchShortcut(press("k", { [m]: true, target: typing }), false), "switcher", m);
    assert.equal(matchShortcut(press("k", { [m]: true }), true), "switcher", m);
  }
  assert.equal(matchShortcut(press("k"), false), null);
  assert.equal(matchShortcut(ctrl("k", { altKey: true }), false), null);
});

test("startsTyping: a plain character outside a field, not a shortcut, space or a named key", () => {
  const field = { tagName: "TEXTAREA", isContentEditable: false };
  assert.equal(startsTyping(press("a")), true);
  assert.equal(startsTyping(press("A", { shiftKey: true })), true);
  assert.equal(startsTyping(press("é", { target: { tagName: "DIV", isContentEditable: false } })), true);
  assert.equal(startsTyping(press(" ")), false);
  assert.equal(startsTyping(press("Enter")), false);
  assert.equal(startsTyping(press("ArrowLeft")), false);
  assert.equal(startsTyping(ctrl("a")), false);
  assert.equal(startsTyping(press("a", { metaKey: true })), false);
  assert.equal(startsTyping(press("a", { altKey: true })), false);
  assert.equal(startsTyping(press("a", { target: field })), false);
  assert.equal(startsTyping(press("a", { target: { tagName: "DIV", isContentEditable: true } })), false);
});
