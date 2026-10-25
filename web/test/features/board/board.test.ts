import { test } from "bun:test";
import assert from "node:assert/strict";
import type { LinearIssue } from "../../../../shared/api.ts";
import { boardColumns, groupBoard } from "../../../src/features/board/board.ts";

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
  assert.deepEqual(groups.map((g) => g.title), ["Alpha", "Beta", "No project"]);
  assert.deepEqual(groups[1]?.issues.map((i) => i.id).sort(), ["1", "4"]);
});

test("groupBoard keeps one unassigned group per team and shows the team", () => {
  const groups = groupBoard([issue("1", { team: { key: "OPS", name: "Ops" } }), issue("2", { team: { key: "ENG", name: "Eng" } })]);
  assert.deepEqual(groups.map((g) => [g.title, g.team]), [["No project", "Eng"], ["No project", "Ops"]]);
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

const state = (name: string, type: string, color = "#999999") => ({ name, type, color });

test("boardColumns makes one column per state name, ordered by state type then name", () => {
  const cols = boardColumns([
    issue("1", { state: state("In Progress", "started") }),
    issue("2", { state: state("Triage", "triage") }),
    issue("3", { state: state("Todo", "unstarted") }),
    issue("4", { state: state("Backlog", "backlog") }),
    issue("5", { state: state("Weird", "custom") }),
    issue("6", { state: state("Ready", "unstarted") }),
    issue("7", { state: state("In Review", "started") }),
  ]);
  assert.deepEqual(cols.map((c) => c.name), ["Triage", "Backlog", "Ready", "Todo", "In Progress", "In Review", "Weird"]);
});

test("boardColumns merges teams that share a state name and counts the issues", () => {
  const cols = boardColumns([
    issue("1", { team: { key: "ENG", name: "Eng" }, state: state("Todo", "unstarted", "#111111") }),
    issue("2", { team: { key: "OPS", name: "Ops" }, state: state("Todo", "unstarted", "#111111") }),
    issue("3", { state: state("Backlog", "backlog") }),
  ]);
  assert.equal(cols.length, 2);
  const todo = cols.find((c) => c.name === "Todo");
  assert.equal(todo?.count, 2);
  assert.equal(todo?.color, "#111111");
  assert.deepEqual(todo?.groups.map((g) => [g.title, g.team]), [["No project", "Eng"], ["No project", "Ops"]]);
});

test("boardColumns groups each column by project and sorts cards by priority", () => {
  const cols = boardColumns([
    issue("a", { project: { id: "pa", name: "Alpha" }, priority: 4 }),
    issue("b", { project: { id: "pa", name: "Alpha" }, priority: 1 }),
    issue("c", { project: { id: "pa", name: "Alpha" }, state: state("Doing", "started") }),
    issue("d"),
  ]);
  const todo = cols.find((c) => c.name === "Todo");
  assert.deepEqual(todo?.groups.map((g) => g.title), ["Alpha", "No project"]);
  assert.deepEqual(todo?.groups[0]?.issues.map((i) => i.id), ["b", "a"]);
  assert.equal(cols.find((c) => c.name === "Doing")?.count, 1);
});

test("boardColumns of nothing is empty", () => {
  assert.deepEqual(boardColumns([]), []);
});
