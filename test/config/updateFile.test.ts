import assert from "node:assert/strict";
import { test } from "bun:test";
import { readUpdateChannel, updateChannelText } from "../../src/config/updateFile.ts";

test("the saved channel survives a restart; invalid or missing files use the default", () => {
  for (const channel of ["stable", "main"] as const) {
    assert.equal(readUpdateChannel("updates.json", () => updateChannelText(channel)), channel);
  }
  for (const text of ["", "{", "null", "[]", '{}', '{"channel":"other"}']) assert.equal(readUpdateChannel("updates.json", () => text), null);
  assert.equal(readUpdateChannel("updates.json", () => { throw new Error("missing"); }), null);
});
