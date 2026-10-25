import { test } from "bun:test";
import assert from "node:assert/strict";
import type { BoardResult } from "../../shared/api.ts";
import { boardNeedsKey, fromChoice, keyLabel, projectOptions, teamRows, toChoice, toTable, unlistedRule } from "../src/linearSettings.ts";

const board = (over: Partial<BoardResult>): BoardResult => ({ workspaces: [], issues: [], fetchedAt: "x", configured: true, ...over });
const workspace = (ok: boolean, error: string | null) => ({ name: "Linear", ok, error, t3ProjectId: null });

test("the setup card shows without a key, or when Linear refuses it, and not for other errors", () => {
  assert.equal(boardNeedsKey(board({ configured: false })), true);
  assert.equal(boardNeedsKey(board({ workspaces: [workspace(false, "Linear refused this key (HTTP 401)")] })), true);
  assert.equal(boardNeedsKey(board({ workspaces: [workspace(false, "Linear is unreachable")] })), false);
  assert.equal(boardNeedsKey(board({ workspaces: [workspace(true, null)] })), false);
});

test("the key label shows the tail, or that nothing is connected", () => {
  assert.equal(keyLabel("abcd"), "Connected, key ending in abcd");
  assert.equal(keyLabel(null), "Not connected");
});

test("the unlisted rule is written out", () => {
  assert.equal(unlistedRule("show"), "Teams that are not listed here are shown.");
  assert.equal(unlistedRule("hide"), "Teams that are not listed here are hidden.");
});

test("choices round trip, and a project named like a fixed choice stays a project", () => {
  for (const value of [null, "", "Project A", "hidden", "ask"]) assert.equal(fromChoice(toChoice(value)), value);
  assert.notEqual(toChoice("hidden"), toChoice(null));
});

test("rows list the Linear teams by name, with saved choices and a default of asking", () => {
  const rows = teamRows([{ key: "OPS", name: "Operations" }, { key: "ENG", name: "Engineering" }, { key: "DES", name: "Design" }], { ENG: "Project A", OPS: null });
  assert.deepEqual(rows.map((row) => [row.key, row.choice]), [["DES", toChoice("")], ["ENG", toChoice("Project A")], ["OPS", toChoice(null)]]);
});

test("a saved team that Linear no longer lists stays in the rows", () => {
  const rows = teamRows([{ key: "ENG", name: "Engineering" }], { OLD: "Project A" });
  assert.deepEqual(rows.map((row) => [row.key, row.name]), [["ENG", "Engineering"], ["OLD", "OLD"]]);
});

test("the table keeps hidden and project rows, and skips untouched asking rows", () => {
  const rows = teamRows([{ key: "ENG", name: "Engineering" }, { key: "OPS", name: "Operations" }, { key: "DES", name: "Design" }], { ENG: "Project A" });
  const edited = rows.map((row) => (row.key === "OPS" ? { ...row, choice: toChoice(null) } : row));
  assert.deepEqual(toTable(edited, { ENG: "Project A" }), { ENG: "Project A", OPS: null });
});

test("a team set back to asking is saved as an empty title when it was saved before", () => {
  const rows = teamRows([{ key: "ENG", name: "Engineering" }], { ENG: "Project A" }).map((row) => ({ ...row, choice: toChoice("") }));
  assert.deepEqual(toTable(rows, { ENG: "Project A" }), { ENG: "" });
});

test("project options list the projects, and mark a saved title that no project has", () => {
  const projects = [{ id: "p1", title: "Project A", defaultModelSelection: null }];
  assert.deepEqual(projectOptions(projects, "Project A"), [{ choice: toChoice("Project A"), label: "Project A" }]);
  assert.deepEqual(projectOptions(projects, "Gone").at(-1), { choice: toChoice("Gone"), label: "Gone (not found)" });
  assert.equal(projectOptions(projects, null).length, 1);
});
