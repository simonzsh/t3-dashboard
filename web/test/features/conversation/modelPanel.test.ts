import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardModel, DashboardProvider } from "../../../../shared/api.ts";
import { chipLabel, currentSpeed, panelModels, selectSpeed } from "../../../src/features/conversation/modelPanel.ts";

const levels = (ids: string[]) => ids.map((id) => ({ id, label: id.toUpperCase() }));
const model = (slug: string, name: string, extra: Partial<DashboardModel> = {}): DashboardModel => ({ slug, name, effort: null, speed: null, favorite: null, ...extra });
const effort = { optionId: "effort", label: "Reasoning", levels: levels(["low", "high"]), defaultLevel: "high" };
const toggle = { optionId: "fastMode", fast: true, standard: false, defaultFast: false };
const tier = { optionId: "serviceTier", fast: "priority", standard: "default", defaultFast: false };

const providers: DashboardProvider[] = [
  { instanceId: "claudeAgent", displayName: "Claude", runtimeModes: [], models: [model("opus", "Opus", { effort, speed: toggle, favorite: 1 }), model("haiku", "Haiku")] },
  { instanceId: "codex", displayName: "Codex", runtimeModes: [], models: [model("gpt", "GPT Pro", { effort, speed: tier, favorite: 0 }), model("mini", "GPT Mini")] },
];
const names = (rows: ReturnType<typeof panelModels>) => rows.map((r) => r.model.slug);

test("panelModels lists a provider's models, or the favorites by rank", () => {
  assert.deepEqual(names(panelModels(providers, "codex", "")), ["gpt", "mini"]);
  assert.deepEqual(names(panelModels(providers, "favorites", "")), ["gpt", "opus"]);
});

test("panelModels searches every provider by model or provider name and ignores the rail", () => {
  assert.deepEqual(names(panelModels(providers, "claudeAgent", " gpt ")), ["gpt", "mini"]);
  assert.deepEqual(names(panelModels(providers, "codex", "CLAUDE")), ["opus", "haiku"]);
  assert.deepEqual(names(panelModels(providers, "codex", "nothing")), []);
});



test("currentSpeed reads the toggle or the tier, standard by default", () => {
  const opus = providers[0]!.models[0]!;
  const gpt = providers[1]!.models[0]!;
  assert.equal(currentSpeed({ instanceId: "claudeAgent", model: "opus", options: [{ id: "fastMode", value: true }] }, opus), "fast");
  assert.equal(currentSpeed({ instanceId: "claudeAgent", model: "opus", options: [{ id: "fastMode", value: false }] }, opus), "standard");
  assert.equal(currentSpeed({ instanceId: "codex", model: "gpt", options: [{ id: "serviceTier", value: "priority" }] }, gpt), "fast");
  assert.equal(currentSpeed({ instanceId: "codex", model: "gpt" }, gpt), "standard");
  assert.equal(currentSpeed(null, providers[0]!.models[1]!), null);
  // No option sent yet: the model's own default, Fast for some.
  assert.equal(currentSpeed({ instanceId: "codex", model: "gpt" }, { ...gpt, speed: { ...tier, defaultFast: true } }), "fast");
});

test("selectSpeed sets the Fast option and keeps the others", () => {
  const opus = providers[0]!.models[0]!;
  const gpt = providers[1]!.models[0]!;
  const from = { instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "low" }] };
  assert.deepEqual(selectSpeed(from, opus, true).options, [{ id: "effort", value: "low" }, { id: "fastMode", value: true }]);
  assert.deepEqual(selectSpeed(selectSpeed(from, opus, true), opus, false).options, [{ id: "effort", value: "low" }, { id: "fastMode", value: false }]);
  assert.deepEqual(selectSpeed({ instanceId: "codex", model: "gpt", options: [{ id: "serviceTier", value: "priority" }] }, gpt, false).options, [{ id: "serviceTier", value: "default" }]);
});

test("chipLabel gives the model, the effort label and the Fast flag", () => {
  const opus = { provider: providers[0]!, model: providers[0]!.models[0]! };
  assert.deepEqual(chipLabel({ instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "low" }, { id: "fastMode", value: true }] }, opus), { name: "Opus", effort: "LOW", fast: true });
  assert.deepEqual(chipLabel({ instanceId: "claudeAgent", model: "opus" }, opus), { name: "Opus", effort: "HIGH", fast: false });
  assert.deepEqual(chipLabel({ instanceId: "claudeAgent", model: "gone" }, null), { name: "gone", effort: null, fast: false });
  assert.deepEqual(chipLabel(null, null), { name: "Model", effort: null, fast: false });
});
