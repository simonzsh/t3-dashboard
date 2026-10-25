import { test } from "bun:test";
import assert from "node:assert/strict";
import type { BoardResult } from "../../shared/api.ts";
import { boardNeedsKey, keyLabel } from "../src/linearSettings.ts";

const board = (over: Partial<BoardResult>): BoardResult => ({ workspaces: [], issues: [], fetchedAt: "x", configured: true, ...over });
const workspace = (ok: boolean, error: string | null) => ({ name: "Linear", ok, error });

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
