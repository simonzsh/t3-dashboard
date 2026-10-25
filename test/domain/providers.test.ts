import assert from "node:assert/strict";
import { test } from "bun:test";
import { toProviders } from "../../src/domain/providers.ts";

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
