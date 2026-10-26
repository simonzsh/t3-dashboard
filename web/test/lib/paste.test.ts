import { test } from "bun:test";
import assert from "node:assert/strict";
import { insertText, type TextField } from "../../src/lib/paste.ts";

function field(value: string, start: number, end = start): TextField {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    setRangeText(text, from, to) {
      this.value = this.value.slice(0, from) + text + this.value.slice(to);
      this.selectionStart = this.selectionEnd = from + text.length;
    },
  };
}

test("insertText keeps the native insert when it worked", () => {
  const f = field("ab", 1);
  const value = insertText(f, "X", (t) => ((f.value = "a" + t + "b"), true));
  assert.equal(value, "aXb");
});

test("insertText inserts at the caret when the native insert was dropped", () => {
  assert.equal(insertText(field("ab", 1), "X", () => true), "aXb");
  assert.equal(insertText(field("ab", 1), "X", () => false), "aXb");
});

test("insertText replaces the selected text", () => {
  assert.equal(insertText(field("hello world", 6, 11), "there", () => false), "hello there");
});
