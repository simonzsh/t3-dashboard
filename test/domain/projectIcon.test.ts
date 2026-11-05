import assert from "node:assert/strict";
import { test } from "bun:test";
import { toProjectIcon } from "../../src/domain/projectIcon.ts";

test("a Lucide name becomes its shapes, with the Tailwind color", () => {
  const icon = toProjectIcon({ kind: "lucide", name: "folder-code", color: "purple" });
  assert.equal(icon?.kind, "lucide");
  if (icon?.kind !== "lucide") return;
  assert.equal(icon.color, "#a855f7");
  assert.ok(icon.shapes.length > 0 && icon.shapes.every((shape) => typeof shape.tag === "string"));
});

test("an unknown name, kind or color is dropped", () => {
  assert.equal(toProjectIcon({ kind: "lucide", name: "no-such-icon", color: "blue" }), null);
  assert.equal(toProjectIcon({ kind: "sticker", name: "brain", color: "blue" }), null);
  assert.equal(toProjectIcon({ kind: "emoji", emoji: "" }), null);
  assert.equal(toProjectIcon(null), null);
  assert.deepEqual(toProjectIcon({ kind: "monogram", text: "AS", color: "plaid" }), { kind: "monogram", text: "AS", color: null });
});

test("a monogram keeps its text and the Tailwind color", () => {
  assert.deepEqual(toProjectIcon({ kind: "monogram", text: "AS", color: "purple" }), { kind: "monogram", text: "AS", color: "#a855f7" });
});

test("an emoji keeps its character", () => {
  assert.deepEqual(toProjectIcon({ kind: "emoji", emoji: "🚀" }), { kind: "emoji", emoji: "🚀" });
});

test("a lucide icon carrying monogramText or monogram is a monogram", () => {
  const want = { kind: "monogram", text: "AS", color: "#a855f7" };
  assert.deepEqual(toProjectIcon({ kind: "lucide", name: "folder", color: "purple", monogramText: "AS" }), want);
  assert.deepEqual(toProjectIcon({ kind: "lucide", name: "folder", color: "purple", monogram: "AS" }), want);
});
