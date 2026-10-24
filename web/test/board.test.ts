import test from "node:test";
import assert from "node:assert/strict";
import type { LinearIssue } from "../../shared/api.ts";
import { groupBoard } from "../src/board.ts";

function issue(id: string, over: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id,
    identifier: `ABC-${id}`,
    title: `Issue ${id}`,
    url: `https://example.test/${id}`,
    state: { name: "Todo", type: "unstarted", color: "#999999" },
    priority: 0,
    priorityLabel: "No priority",
    project: null,
    team: { key: "ABC", name: "Team" },
    workspace: "ws-1",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...over,
  };
}

test("groupBoard groups by project, sorted by name, with unassigned last", () => {
  const issues = [
    issue("1", { project: { id: "pb", name: "Beta" } }),
    issue("2"),
    issue("3", { project: { id: "pa", name: "Alpha" } }),
    issue("4", { project: { id: "pb", name: "Beta" } }),
  ];
  const groups = groupBoard(issues);
  assert.deepEqual(groups.map((g) => g.title), ["Alpha", "Beta", "Sans projet"]);
  assert.deepEqual(groups[1]?.issues.map((i) => i.id).sort(), ["1", "4"]);
});

test("groupBoard keeps one unassigned group per workspace and shows the workspace", () => {
  const groups = groupBoard([issue("1", { workspace: "ws-2" }), issue("2", { workspace: "ws-1" })]);
  assert.deepEqual(groups.map((g) => [g.title, g.workspace]), [["Sans projet", "ws-1"], ["Sans projet", "ws-2"]]);
});

test("groupBoard sorts issues by priority (urgent first, none last) then recency", () => {
  const groups = groupBoard([
    issue("none", { priority: 0 }),
    issue("low", { priority: 4 }),
    issue("urgent", { priority: 1 }),
    issue("low-new", { priority: 4, updatedAt: "2026-03-02T10:00:00.000Z" }),
  ]);
  assert.deepEqual(groups[0]?.issues.map((i) => i.id), ["urgent", "low-new", "low", "none"]);
});

test("groupBoard of nothing is empty", () => {
  assert.deepEqual(groupBoard([]), []);
});
