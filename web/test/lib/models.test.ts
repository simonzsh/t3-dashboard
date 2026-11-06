import { test } from "bun:test";
import assert from "node:assert/strict";
import { modelLabel, modelNameMap } from "../../src/lib/models.ts";

test("model names: the display name, the slug when unknown, null without a model", () => {
  const names = modelNameMap([{ instanceId: "p", displayName: "P", runtimeModes: [], models: [{ slug: "m-1", name: "Model One", effort: null, speed: null, favorite: null }] }]);
  assert.equal(modelLabel("m-1", names), "Model One");
  assert.equal(modelLabel("m-2", names), "m-2");
  assert.equal(modelLabel(null, names), null);
});
