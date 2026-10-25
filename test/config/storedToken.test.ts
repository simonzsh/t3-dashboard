import assert from "node:assert/strict";
import { test } from "bun:test";
import { readStoredToken, tokenFile } from "../../src/config/storedToken.ts";

const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

test("an empty T3_DASHBOARD_TOKEN_FILE falls back to the default auth.json", () => {
  const read = files({ "/h/.config/t3-dashboard/auth.json": '{"token":" abc "}' });
  assert.equal(tokenFile({ T3_DASHBOARD_TOKEN_FILE: "" }, "/h"), "/h/.config/t3-dashboard/auth.json");
  assert.equal(readStoredToken({ T3_DASHBOARD_TOKEN_FILE: "" }, "/h", read), "abc");
  assert.equal(readStoredToken({}, "/h", read), "abc");
});

test("T3_DASHBOARD_TOKEN_FILE wins, and a missing, broken or empty token gives null", () => {
  assert.equal(readStoredToken({ T3_DASHBOARD_TOKEN_FILE: "/t.json" }, "/h", files({ "/t.json": '{"token":"x"}' })), "x");
  assert.equal(readStoredToken({ T3_DASHBOARD_TOKEN_FILE: "/t.json" }, "/h", files({})), null);
  for (const text of ["garbage", "null", '{"token":"  "}', '{"token":3}']) {
    assert.equal(readStoredToken({ T3_DASHBOARD_TOKEN_FILE: "/t.json" }, "/h", files({ "/t.json": text })), null, text);
  }
});
