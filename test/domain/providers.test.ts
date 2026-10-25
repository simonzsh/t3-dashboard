import assert from "node:assert/strict";
import { test } from "bun:test";
import { toModelDefaults, toProviders } from "../../src/domain/providers.ts";

test("toProviders keeps the effort levels a model accepts and the provider's runtime modes", () => {
  const effort = {
    id: "effort",
    label: "Reasoning",
    type: "select",
    options: [{ id: "low", label: "Low" }, { id: "high", label: "High", isDefault: true }, { id: "ultrathink", label: "Ultrathink" }],
    promptInjectedValues: ["ultrathink"],
  };
  const tier = { id: "serviceTier", label: "Tier", type: "select", options: [{ id: "default", label: "Standard" }] };
  const reasoning = { id: "reasoningEffort", label: "Reasoning", type: "select", options: [{ id: "medium", label: "Medium" }], currentValue: "medium" };
  const [a, b] = toProviders({
    providers: [
      { instanceId: "a", enabled: true, status: "ready", models: [{ slug: "m1", capabilities: { optionDescriptors: [{ id: "fastMode", label: "Fast", type: "boolean" }, effort] } }] },
      { instanceId: "b", enabled: true, status: "ready", supportedRuntimeModes: ["approval-required", "bogus", "full-access"], models: [{ slug: "m2", capabilities: { optionDescriptors: [tier, reasoning] } }] },
    ],
  });
  assert.deepEqual(a!.models[0]!.effort, { optionId: "effort", levels: [{ id: "low", label: "Low" }, { id: "high", label: "High" }], defaultLevel: "high" });
  assert.deepEqual(b!.models[0]!.effort, { optionId: "reasoningEffort", levels: [{ id: "medium", label: "Medium" }], defaultLevel: "medium" });
  assert.deepEqual(b!.runtimeModes, ["approval-required", "full-access"]);
});

test("toProviders follows T3's model order, hides hidden models and ranks favorites", () => {
  const models = ["m1", "m2", "m3", "m4"].map((slug) => ({ slug }));
  const [a] = toProviders({
    providers: [{ instanceId: "a", enabled: true, status: "ready", models }],
    settings: {
      providerModelPreferences: { a: { hiddenModels: ["m2"], modelOrder: ["m4", "m1"] } },
      favorites: [{ provider: "a", model: "m3" }, { provider: "other", model: "m1" }, { provider: "a", model: "m4" }],
    },
  });
  assert.deepEqual(a!.models.map((m) => [m.slug, m.favorite]), [["m4", 2], ["m1", null], ["m3", 0]]);
});

test("toModelDefaults reads T3's default model and access, and ignores a bad mode", () => {
  const selection = { instanceId: "a", model: "m1", options: [{ id: "effort", value: "medium" }] };
  assert.deepEqual(toModelDefaults({ settings: { defaultModelSelection: selection, defaultRuntimeMode: "full-access" } }), { selection, runtimeMode: "full-access" });
  assert.deepEqual(toModelDefaults({ settings: { defaultRuntimeMode: "yolo" } }), { selection: null, runtimeMode: null });
  assert.deepEqual(toModelDefaults({}), { selection: null, runtimeMode: null });
});
