import { test } from "bun:test";
import assert from "node:assert/strict";
import type { BoardResult } from "../../../../shared/api.ts";
import { boardNeedsKey, linearConnected, maskedKey } from "../../../src/features/settings/linearSettings.ts";

const board = (over: Partial<BoardResult>): BoardResult => ({ configured: true, ok: true, error: null, issues: [], ...over });

test("the setup card shows without a key, or when Linear refuses it, and not for other errors", () => {
  assert.equal(boardNeedsKey(board({ configured: false, ok: false, error: "Missing API key" })), true);
  assert.equal(boardNeedsKey(board({ ok: false, error: "Linear refused this key (HTTP 401)" })), true);
  assert.equal(boardNeedsKey(board({ ok: false, error: "Linear is unreachable" })), false);
  assert.equal(boardNeedsKey(board({})), false);
});

test("the key label shows the tail, or that nothing is connected", () => {
  assert.equal(maskedKey("abcd"), "lin_api_••••abcd");
});

test("the Board says it is connected to Linear once Linear answers", () => {
  assert.equal(linearConnected(board({})), true);
  assert.equal(linearConnected(board({ ok: false, error: "Linear is unreachable" })), false);
  assert.equal(linearConnected(board({ configured: false, ok: false, error: "Missing API key" })), false);
});
