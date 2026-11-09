import { test } from "bun:test";
import assert from "node:assert/strict";
import { loadPhoneSession, savePhoneSession } from "../../src/lib/phoneSession.ts";

test("mobile navigation restores both an open session and an explicit return to the list", () => {
  const data = new Map<string, string>();
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.equal(loadPhoneSession(store), false);
  savePhoneSession(store, true);
  assert.equal(loadPhoneSession(store), true);
  savePhoneSession(store, false);
  assert.equal(loadPhoneSession(store), false);
});

test("unavailable storage keeps the mobile session list as the default", () => {
  assert.equal(loadPhoneSession(null), false);
  savePhoneSession(null, true);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(loadPhoneSession(blocked), false);
  assert.doesNotThrow(() => savePhoneSession(blocked, true));
});
