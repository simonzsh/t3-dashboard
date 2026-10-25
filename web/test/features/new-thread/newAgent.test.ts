import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardProvider } from "../../../../shared/api.ts";
import { loadNewAgentProject, presetSelection, saveNewAgentProject, titleFromMessage } from "../../../src/features/new-thread/newAgent.ts";
import { memoryStore } from "../../fixtures.ts";

const projects = [
  { id: "p1", title: "Project A", defaultModelSelection: { instanceId: "b", model: "b-2" }, icon: null },
  { id: "p2", title: "Project B", defaultModelSelection: { instanceId: "gone", model: "x" }, icon: null },
];
const providers = [
  { instanceId: "a", displayName: "A", models: [{ slug: "a-1", name: "A 1" }] },
  { instanceId: "b", displayName: "B", models: [{ slug: "b-1", name: "B 1" }, { slug: "b-2", name: "B 2" }] },
] as DashboardProvider[];

test("the title is the first line of the message", () => {
  assert.equal(titleFromMessage("\n  Fix the login page  \nwith details"), "Fix the login page");
});

test("a long first line is cut to 60 characters with an ellipsis", () => {
  const title = titleFromMessage("x".repeat(80));
  assert.equal(title.length, 60);
  assert.ok(title.endsWith("…"));
  assert.equal(titleFromMessage("y".repeat(60)), "y".repeat(60));
});

test("the last project used is preselected while it still exists", () => {
  const storage = memoryStore();
  assert.equal(loadNewAgentProject(storage, projects), "");
  saveNewAgentProject(storage, "p2");
  assert.equal(loadNewAgentProject(storage, projects), "p2");
  saveNewAgentProject(storage, "gone");
  assert.equal(loadNewAgentProject(storage, projects), "");
  assert.equal(loadNewAgentProject(null, projects), "");
});

test("the model preset is the project default when available, else the first model", () => {
  assert.deepEqual(presetSelection(projects[0], providers), { instanceId: "b", model: "b-2" });
  assert.deepEqual(presetSelection(projects[1], providers), { instanceId: "a", model: "a-1" });
  assert.deepEqual(presetSelection(undefined, providers), { instanceId: "a", model: "a-1" });
  assert.equal(presetSelection(undefined, []), null);
});

test("presetSelection falls back on T3's default before the first model", () => {
  const t3Default = { instanceId: "b", model: "b-2", options: [{ id: "effort", value: "medium" }] };
  assert.deepEqual(presetSelection(undefined, providers, t3Default), t3Default);
  assert.deepEqual(presetSelection(projects[0], providers, { instanceId: "a", model: "a-1" }), { instanceId: "b", model: "b-2" });
  assert.deepEqual(presetSelection(undefined, providers, { instanceId: "gone", model: "x" }), { instanceId: "a", model: "a-1" });
});
