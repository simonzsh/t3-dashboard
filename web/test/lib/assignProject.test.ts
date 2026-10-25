import { test } from "bun:test";
import assert from "node:assert/strict";
import { loadAssignProject, saveAssignProject } from "../../src/lib/assignProject.ts";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};
const projects = [
  { id: "p1", title: "Project A", defaultModelSelection: null },
  { id: "p2", title: "Project B", defaultModelSelection: null },
];

test("nothing is preselected before a first choice", () => {
  assert.equal(loadAssignProject(memory(), "ENG", projects), "");
});

test("the last project chosen for a team is preselected for that team only", () => {
  const storage = memory();
  saveAssignProject(storage, "ENG", "p2");
  saveAssignProject(storage, "OPS", "p1");
  assert.equal(loadAssignProject(storage, "ENG", projects), "p2");
  assert.equal(loadAssignProject(storage, "OPS", projects), "p1");
  assert.equal(loadAssignProject(storage, "HR", projects), "");
});

test("a remembered project that no longer exists is not preselected", () => {
  const storage = memory();
  saveAssignProject(storage, "ENG", "gone");
  assert.equal(loadAssignProject(storage, "ENG", projects), "");
});

test("a storage that throws gives no preselection and no error", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(loadAssignProject(broken, "ENG", projects), "");
  assert.doesNotThrow(() => saveAssignProject(broken, "ENG", "p1"));
});
