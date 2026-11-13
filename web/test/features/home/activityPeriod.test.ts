import { test } from "bun:test";
import assert from "node:assert/strict";
import { ACTIVITY_PERIOD_KEY, loadActivityPeriod, PERIOD_OPTIONS, periodLabel, saveActivityPeriod } from "../../../src/features/home/activityPeriod.ts";
import { memoryStore } from "../../fixtures.ts";

test("the period is 7 days until the browser saved another one", () => {
  const storage = memoryStore();
  assert.equal(loadActivityPeriod(storage), 7);
  assert.equal(loadActivityPeriod(null), 7);
});

test("a saved period comes back as a number", () => {
  const storage = memoryStore();
  saveActivityPeriod(storage, 30);
  assert.equal(storage.data.get(ACTIVITY_PERIOD_KEY), "30");
  assert.equal(loadActivityPeriod(storage), 30);
  saveActivityPeriod(storage, 90);
  assert.equal(loadActivityPeriod(storage), 90);
});

test("an unknown stored value or a blocked storage gives 7", () => {
  const storage = memoryStore();
  for (const junk of ["14", "abc", "", "30.5", "[30]"]) {
    storage.data.set(ACTIVITY_PERIOD_KEY, junk);
    assert.equal(loadActivityPeriod(storage), 7, junk);
  }
  assert.equal(loadActivityPeriod({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }), 7);
});

test("the menu lists the three periods with their labels", () => {
  assert.deepEqual(PERIOD_OPTIONS.map((o) => [o.id, o.label]), [["7", "last 7 days"], ["30", "last 30 days"], ["90", "last 90 days"]]);
  assert.equal(periodLabel(30), "last 30 days");
});
