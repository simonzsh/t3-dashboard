import assert from "node:assert/strict";
import { test } from "bun:test";
import { toComposerCommands, toModelDefaults, toProviders } from "../../src/domain/providers.ts";

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
  assert.deepEqual(a!.models[0]!.effort, { optionId: "effort", label: "Reasoning", levels: [{ id: "low", label: "Low" }, { id: "high", label: "High" }], defaultLevel: "high" });
  assert.deepEqual(b!.models[0]!.effort, { optionId: "reasoningEffort", label: "Reasoning", levels: [{ id: "medium", label: "Medium" }], defaultLevel: "medium" });
  assert.deepEqual(b!.runtimeModes, ["approval-required", "full-access"]);
});

test("toProviders reads the Fast option: a fastMode toggle, or a service tier named Fast", () => {
  const tier = {
    id: "serviceTier",
    label: "Speed",
    type: "select",
    options: [{ id: "default", label: "Standard", isDefault: true }, { id: "priority", label: "Fast" }],
  };
  const [a] = toProviders({
    providers: [
      {
        instanceId: "a",
        enabled: true,
        status: "ready",
        models: [
          { slug: "toggle", capabilities: { optionDescriptors: [{ id: "fastMode", label: "Fast", type: "boolean" }] } },
          { slug: "tier", capabilities: { optionDescriptors: [tier] } },
          { slug: "none", capabilities: { optionDescriptors: [{ id: "serviceTier", type: "select", options: [{ id: "default", label: "Standard" }] }] } },
        ],
      },
    ],
  });
  assert.deepEqual(a!.models.map((m) => m.speed), [{ optionId: "fastMode", fast: true, standard: false, defaultFast: false }, { optionId: "serviceTier", fast: "priority", standard: "default", defaultFast: false }, null]);
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

const skill = (name: string, extra: Record<string, unknown> = {}) => ({ name, path: `/skills/${name}`, enabled: true, ...extra });

test("toComposerCommands reads the provider's own list with no folder", () => {
  const config = {
    providers: [
      {
        instanceId: "a",
        slashCommands: [{ name: "compact", description: "Summarize" }, { name: "goal", input: { hint: "Objective" } }],
        skills: [skill("review", { displayName: "Code Review", description: "Long", shortDescription: "Short" })],
      },
      { instanceId: "b", slashCommands: [{ name: "other" }] },
    ],
  };
  assert.deepEqual(toComposerCommands(config, "a", null), {
    commands: [{ name: "compact", description: "Summarize" }, { name: "goal", description: null, hint: "Objective" }],
    skills: [{ name: "review", displayName: "Code Review", description: "Short" }],
  });
  assert.deepEqual(toComposerCommands(config, "missing", null), { commands: [], skills: [] });
});

test("toComposerCommands prefers the snapshot of the thread's folder", () => {
  const config = {
    providers: [
      {
        instanceId: "a",
        slashCommands: [{ name: "global" }],
        skills: [skill("global-skill")],
        workspaceSnapshots: [
          { cwd: "/other", slashCommands: [{ name: "other" }], skills: [] },
          { cwd: "/work", slashCommands: [{ name: "local" }], skills: [skill("local-skill")] },
        ],
      },
    ],
  };
  const found = toComposerCommands(config, "a", "/work");
  assert.deepEqual([found.commands.map((c) => c.name), found.skills.map((k) => k.name)], [["local"], ["local-skill"]]);
  const none = toComposerCommands(config, "a", "/unknown");
  assert.deepEqual([none.commands.map((c) => c.name), none.skills.map((k) => k.name)], [["global"], ["global-skill"]]);
});

test("toComposerCommands leaves out skills a user cannot invoke", () => {
  const config = { providers: [{ instanceId: "a", skills: [skill("on"), skill("off", { enabled: false }), skill("internal", { userInvocable: false }), skill("explicit", { userInvocable: true })] }] };
  assert.deepEqual(toComposerCommands(config, "a", null).skills.map((k) => k.name), ["on", "explicit"]);
});

test("toProviders keeps the provider kind, which the instance id may not say", () => {
  const [a, b] = toProviders({ providers: [{ instanceId: "work-claude", driver: "claudeAgent", enabled: true, status: "ready", models: [] }, { instanceId: "x", enabled: true, status: "ready", models: [] }] });
  assert.equal(a!.driver, "claudeAgent");
  assert.equal(b!.driver, undefined);
});

test("a model that starts on Fast keeps a distinct Standard option and says Fast is its default", () => {
  const tier = { id: "serviceTier", label: "Tier", type: "select", options: [{ id: "priority", label: "Fast", isDefault: true }, { id: "default", label: "Standard" }] };
  const toggle = { id: "fastMode", label: "Fast", type: "boolean", currentValue: true };
  const [p] = toProviders({ providers: [{ instanceId: "a", enabled: true, status: "ready", models: [{ slug: "terra", capabilities: { optionDescriptors: [tier] } }, { slug: "opus", capabilities: { optionDescriptors: [toggle] } }] }] });
  assert.deepEqual(p!.models.map((m) => m.speed), [
    { optionId: "serviceTier", fast: "priority", standard: "default", defaultFast: true },
    { optionId: "fastMode", fast: true, standard: false, defaultFast: true },
  ]);
});
