import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProject } from "../../../../shared/api.ts";
import { EMOJI_PRESETS, editBody, firstGrapheme, iconChanged, monogramFromInput } from "../../../src/features/projects/projectIcons.ts";

const project: DashboardProject = {
  id: "p1",
  title: "Shop",
  defaultModelSelection: null,
  icon: null,
  workspaceRoot: "/home/u/shop",
  iconSpec: { kind: "lucide", name: "rocket", color: "blue" },
};
const same = { title: "Shop", path: "/home/u/shop", icon: project.iconSpec ?? null };

test("editBody is null when nothing changed", () => {
  assert.equal(editBody(project, same), null);
  assert.equal(editBody(project, { ...same, title: "  Shop  ", path: " /home/u/shop " }), null);
});

test("editBody sends only the changed fields", () => {
  assert.deepEqual(editBody(project, { ...same, title: "Store" }), { title: "Store" });
  assert.deepEqual(editBody(project, { ...same, path: "~/store" }), { path: "~/store" });
  assert.deepEqual(editBody(project, { ...same, icon: { kind: "emoji", emoji: "🚀" } }), { icon: { kind: "emoji", emoji: "🚀" } });
});

test("editBody sends icon null to go back to the default, and nothing when there was none", () => {
  assert.deepEqual(editBody(project, { ...same, icon: null }), { icon: null });
  assert.equal(editBody({ ...project, iconSpec: undefined }, { ...same, icon: null }), null);
});

test("iconChanged compares kind, name, text, emoji and color", () => {
  const rocket = { kind: "lucide", name: "rocket", color: "blue" } as const;
  assert.equal(iconChanged(rocket, { ...rocket }), false);
  assert.equal(iconChanged(rocket, { ...rocket, color: "red" }), true);
  assert.equal(iconChanged(rocket, { kind: "lucide", name: "server", color: "blue" }), true);
  assert.equal(iconChanged(rocket, { kind: "monogram", text: "R", color: "blue" }), true);
  assert.equal(iconChanged({ kind: "monogram", text: "AB", color: "red" }, { kind: "monogram", text: "AB", color: "red" }), false);
  assert.equal(iconChanged({ kind: "emoji", emoji: "🚀" }, { kind: "emoji", emoji: "🔥" }), true);
  assert.equal(iconChanged(null, null), false);
  assert.equal(iconChanged(null, rocket), true);
});

test("monogramFromInput keeps two letters or digits, uppercased", () => {
  assert.equal(monogramFromInput("abc"), "AB");
  assert.equal(monogramFromInput("  a "), "A");
  assert.equal(monogramFromInput("é1"), "É1");
  assert.equal(monogramFromInput("ßa"), "SS");
  assert.equal(monogramFromInput("a-b"), "AB");
  assert.equal(monogramFromInput("…"), "");
  assert.equal(monogramFromInput("ＡＢ"), "AB");
});

test("firstGrapheme takes one whole emoji", () => {
  assert.equal(firstGrapheme("🚀 go"), "🚀");
  assert.equal(firstGrapheme("🖥️x"), "🖥️");
  assert.equal(firstGrapheme("  "), "");
});

test("the emoji presets are T3's thirty, each with a label", () => {
  assert.equal(EMOJI_PRESETS.length, 30);
  assert.deepEqual(EMOJI_PRESETS[0], { emoji: "💻", label: "Computer" });
  assert.equal(new Set(EMOJI_PRESETS.map((e) => e.emoji)).size, 30);
});
