import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ProjectRef } from "../../../../shared/api.ts";
import { defaultBaseRef, initialDraft, initialEnvMode, sanitizeBranchName, showDirtyWarning, toWorkspaceChoice, type WorkspaceDraft } from "../../../src/features/new-thread/workspaceOptions.ts";

const ROOT = "/srv/app";
const ref = (name: string, extra: Partial<ProjectRef> = {}): ProjectRef => ({ name, remote: false, current: false, isDefault: false, worktreePath: null, ...extra });
const draft = (extra: Partial<WorkspaceDraft> = {}): WorkspaceDraft => ({ envMode: "local", ref: null, newBranch: null, startFromOrigin: false, plan: false, ...extra });

test("initialEnvMode follows the project default, local when absent", () => {
  assert.equal(initialEnvMode({ defaultThreadEnvMode: "worktree" }), "worktree");
  assert.equal(initialEnvMode({}), "local");
});

test("sanitizeBranchName trims and turns whitespace into dashes", () => {
  assert.equal(sanitizeBranchName("  my  new\tbranch "), "my-new-branch");
});

test("defaultBaseRef is the current ref", () => {
  assert.equal(defaultBaseRef([ref("a"), ref("main", { current: true })])?.name, "main");
  assert.equal(defaultBaseRef([ref("a")]), null);
});

test("initialDraft preselects the base ref in worktree mode only", () => {
  const refs = [ref("main", { current: true })];
  assert.equal(initialDraft({ defaultThreadEnvMode: "worktree" }, refs).ref?.name, "main");
  assert.equal(initialDraft({}, refs).ref, null);
});

test("local mode: no ref, current ref and no choice stay on the checkout as is", () => {
  assert.equal(toWorkspaceChoice(draft(), ROOT), undefined);
  assert.equal(toWorkspaceChoice(draft({ ref: ref("main", { current: true, worktreePath: ROOT }) }), ROOT), undefined);
});

test("local mode: another branch is checked out in the project folder", () => {
  assert.deepEqual(toWorkspaceChoice(draft({ ref: ref("dev") }), ROOT), { type: "root", branch: "dev" });
  assert.deepEqual(toWorkspaceChoice(draft({ ref: ref("origin/dev", { remote: true }) }), ROOT), { type: "root", branch: "origin/dev" });
});

test("local mode: a branch held by another worktree reuses it", () => {
  assert.deepEqual(toWorkspaceChoice(draft({ ref: ref("dev", { worktreePath: "/srv/wt/dev" }) }), ROOT), { type: "existing_worktree", worktreePath: "/srv/wt/dev", branch: "dev" });
});

test("local mode: a new branch is created", () => {
  assert.deepEqual(toWorkspaceChoice(draft({ newBranch: "feat-x" }), ROOT), { type: "root", branch: "feat-x", create: true });
});

test("worktree mode sends the base ref and the origin flag only when set", () => {
  assert.deepEqual(toWorkspaceChoice(draft({ envMode: "worktree", ref: ref("main") }), ROOT), { type: "worktree", baseRef: "main" });
  assert.deepEqual(toWorkspaceChoice(draft({ envMode: "worktree", ref: ref("main"), startFromOrigin: true }), ROOT), { type: "worktree", baseRef: "main", startFromOrigin: true });
});

test("worktree mode without a base ref is an error", () => {
  assert.throws(() => toWorkspaceChoice(draft({ envMode: "worktree" }), ROOT), /Select a base branch before sending in New worktree mode\./);
});

test("the dirty warning shows when the checkout would switch or create a branch", () => {
  const dirty = { hasChanges: true };
  assert.equal(showDirtyWarning(draft({ ref: ref("dev") }), ROOT, dirty), true);
  assert.equal(showDirtyWarning(draft({ newBranch: "x" }), ROOT, dirty), true);
  assert.equal(showDirtyWarning(draft({ ref: ref("dev") }), ROOT, { hasChanges: false }), false);
  assert.equal(showDirtyWarning(draft(), ROOT, dirty), false);
  assert.equal(showDirtyWarning(draft({ ref: ref("dev", { worktreePath: "/srv/wt" }) }), ROOT, dirty), false);
  assert.equal(showDirtyWarning(draft({ envMode: "worktree", ref: ref("dev") }), ROOT, dirty), false);
});
