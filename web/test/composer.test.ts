import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardProvider } from "../../shared/api.ts";
import { MAX_IMAGE_BYTES, MAX_IMAGES, MAX_TOTAL_BYTES, acceptImages, currentEffort, findModel, selectEffort, selectModel } from "../src/composer.ts";

const effort = (optionId: string, ids: string[], defaultLevel: string | null) => ({ optionId, levels: ids.map((id) => ({ id, label: id.toUpperCase() })), defaultLevel });
const providers: DashboardProvider[] = [
  {
    instanceId: "claudeAgent",
    displayName: "Claude",
    runtimeModes: ["approval-required", "full-access"],
    models: [
      { slug: "opus", name: "Opus", effort: effort("effort", ["low", "medium", "high", "max"], "medium") },
      { slug: "haiku", name: "Haiku", effort: null },
    ],
  },
  { instanceId: "codex", displayName: "Codex", runtimeModes: ["full-access"], models: [{ slug: "gpt", name: "GPT", effort: effort("reasoningEffort", ["low", "high"], "high") }] },
];

test("findModel locates the provider and model of a selection", () => {
  const found = findModel(providers, { instanceId: "codex", model: "gpt" });
  assert.equal(found?.provider.displayName, "Codex");
  assert.equal(found?.model.name, "GPT");
  assert.equal(findModel(providers, { instanceId: "codex", model: "gone" }), null);
  assert.equal(findModel(providers, null), null);
});

test("currentEffort reads the option, else the model default", () => {
  const opus = providers[0]!.models[0]!;
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "high" }] }, opus), "high");
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "opus" }, opus), "medium");
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "ultra" }] }, opus), "medium");
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "haiku" }, providers[0]!.models[1]!), null);
});

test("selectEffort replaces only the effort option", () => {
  const opus = providers[0]!.models[0]!;
  const before = { instanceId: "claudeAgent", model: "opus", options: [{ id: "fastMode", value: false }, { id: "effort", value: "low" }] };
  assert.deepEqual(selectEffort(before, opus, "max"), { instanceId: "claudeAgent", model: "opus", options: [{ id: "fastMode", value: false }, { id: "effort", value: "max" }] });
});

test("selectModel keeps the effort only when the new model accepts it", () => {
  const from = { instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "high" }, { id: "fastMode", value: true }] };
  assert.deepEqual(selectModel(from, providers[1]!, providers[1]!.models[0]!), { instanceId: "codex", model: "gpt", options: [{ id: "reasoningEffort", value: "high" }] });
  assert.deepEqual(selectModel({ ...from, options: [{ id: "effort", value: "max" }] }, providers[1]!, providers[1]!.models[0]!), { instanceId: "codex", model: "gpt" });
  assert.deepEqual(selectModel(from, providers[0]!, providers[0]!.models[1]!), { instanceId: "claudeAgent", model: "haiku" });
  assert.deepEqual(selectModel(null, providers[0]!, providers[0]!.models[0]!), { instanceId: "claudeAgent", model: "opus" });
});

const file = (name: string, type: string, size: number) => ({ name, type, size });

test("acceptImages takes PNG, JPEG, GIF and WebP up to the limits", () => {
  const ok = acceptImages([], [file("a.png", "image/png", 10), file("b.webp", "image/webp", 10)]);
  assert.deepEqual([ok.accepted.map((f) => f.name), ok.error], [["a.png", "b.webp"], null]);
  const mixed = acceptImages([], [file("a.pdf", "application/pdf", 10), file("b.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1), file("c.gif", "image/gif", 5)]);
  assert.deepEqual(mixed.accepted.map((f) => f.name), ["c.gif"]);
  assert.ok(mixed.error);
  const full = acceptImages(Array.from({ length: MAX_IMAGES - 1 }, () => ({ size: 1 })), [file("a.png", "image/png", 1), file("b.png", "image/png", 1)]);
  assert.deepEqual(full.accepted.map((f) => f.name), ["a.png"]);
  assert.ok(full.error);
  const heavy = acceptImages([{ size: MAX_TOTAL_BYTES - 5 }], [file("a.png", "image/png", 4), file("b.png", "image/png", 4)]);
  assert.deepEqual(heavy.accepted.map((f) => f.name), ["a.png"]);
  assert.ok(heavy.error);
});
