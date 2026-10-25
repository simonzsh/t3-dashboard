import assert from "node:assert/strict";
import { test } from "bun:test";
import { toProjectIcon } from "../../src/domain/projectIcon.ts";

test("a Lucide name becomes its shapes, with the Tailwind color", () => {
  const icon = toProjectIcon({ kind: "lucide", name: "folder-code", color: "purple" });
  assert.equal(icon?.color, "#a855f7");
  assert.ok(icon && icon.shapes.length > 0 && icon.shapes.every((shape) => typeof shape.tag === "string"));
});

test("an unknown name, kind or color is dropped", () => {
  assert.equal(toProjectIcon({ kind: "lucide", name: "no-such-icon", color: "blue" }), null);
  assert.equal(toProjectIcon({ kind: "emoji", name: "brain", color: "blue" }), null);
  assert.equal(toProjectIcon(null), null);
  assert.equal(toProjectIcon({ kind: "lucide", name: "brain", color: "plaid" })?.color, null);
});
