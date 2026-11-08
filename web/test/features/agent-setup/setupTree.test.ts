import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SetupFile } from "../../../../shared/api.ts";
import { buildTree, chainRows, displayPath, isMasked, issueTotals, statusByServer } from "../../../src/features/agent-setup/setupTree.ts";
import { inventory, setupFile } from "./fixtures.ts";

test("paths under home show as ~/…, others stay as they are", () => {
  assert.equal(displayPath("/home/u/.claude/CLAUDE.md", "/home/u"), "~/.claude/CLAUDE.md");
  assert.equal(displayPath("/home/u", "/home/u"), "~");
  assert.equal(displayPath("/home/user2/x.md", "/home/u"), "/home/user2/x.md");
  assert.equal(displayPath("/etc/claude-code/CLAUDE.md", "/home/u"), "/etc/claude-code/CLAUDE.md");
});

test("the tree groups files by folder and merges single-child folders", () => {
  const files = [
    setupFile("/home/u/.claude/CLAUDE.md"),
    setupFile("/home/u/.claude/rules/style.md"),
    setupFile("/home/u/.claude/rules/tests.md"),
    setupFile("/etc/claude-code/CLAUDE.md"),
  ];
  const tree = buildTree(files, "/home/u");
  assert.deepEqual(tree.map((n) => n.name), ["~/.claude", "/etc/claude-code"]);
  const claude = tree[0]!;
  assert.deepEqual(claude.children.map((n) => n.name), ["CLAUDE.md", "rules"]);
  assert.deepEqual(claude.children[1]!.children.map((n) => n.name), ["style.md", "tests.md"]);
  assert.equal(claude.children[0]!.item?.id, "/home/u/.claude/CLAUDE.md");
});

test("a folder counts the issues of its files and shows the worst severity", () => {
  const files = [
    setupFile("/home/u/p/CLAUDE.md", { issues: [{ code: "broken-import", severity: "warning", message: "x" }] }),
    setupFile("/home/u/p/AGENTS.md", { issues: [{ code: "unreadable", severity: "error", message: "y" }, { code: "truncated", severity: "info", message: "z" }] }),
    setupFile("/home/u/p/ok.md"),
  ];
  const [dir] = buildTree(files, "/home/u");
  assert.equal(dir?.name, "~/p");
  assert.equal(dir?.issues, 3);
  assert.equal(dir?.worst, "error");
  assert.equal(dir?.children.find((n) => n.name === "ok.md")?.worst, null);
});

test("issue totals split by severity", () => {
  const files: SetupFile[] = [setupFile("/a", { issues: [{ code: "unreadable", severity: "error", message: "" }, { code: "truncated", severity: "info", message: "" }] })];
  assert.deepEqual(issueTotals(files, [{ code: "not-trusted", severity: "warning", message: "" }]), { error: 1, warning: 1, info: 1 });
});

test("chain rows follow the load order with 1-based numbers and display paths", () => {
  const inv = inventory();
  const rows = chainRows(inv, "p1", "claude");
  assert.deepEqual(rows.map((r) => [r.order, r.path, r.scope, r.active]), [
    [1, "~/.claude/CLAUDE.md", "user", true],
    [2, "~/src/web/CLAUDE.md", "project", true],
    [3, "~/src/web/AGENTS.md", "project", false],
  ]);
  assert.equal(rows[2]!.note, "Claude reads CLAUDE.md only");
  assert.deepEqual(chainRows(inv, "missing", "claude"), []);
});

test("masked values are recognised, with or without text around the mask", () => {
  assert.ok(isMasked("••••••"));
  assert.ok(isMasked("Bearer ••••••"));
  assert.ok(!isMasked("sk"));
});

test("statuses are found by server id", () => {
  const map = statusByServer({ readAt: "", cli: { available: false, ranAt: null, error: null }, servers: [{ serverId: "a", name: "a", tool: "claude", scope: "user", transport: "http", target: "", projectIds: [], status: "reachable", detail: "200", source: "http", checkedAt: null }] });
  assert.equal(map.get("a")?.status, "reachable");
  assert.equal(statusByServer(null).size, 0);
});
