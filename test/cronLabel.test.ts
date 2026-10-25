import assert from "node:assert/strict";
import { test } from "node:test";
import { cronLabel } from "../src/cronLabel.ts";

const cases: Array<[string, string]> = [
  ["*/20 * * * *", "every 20 min"],
  ["*/20 8-19 * * *", "every 20 min, 08:00–19:00"],
  ["0 23 * * *", "daily at 23:00"],
  ["5 9 * * *", "daily at 09:05"],
  ["0 19 * * 1-5", "weekdays at 19:00"],
  ["0 18 * * 4", "Thursdays at 18:00"],
  ["30 7 * * 0", "Sundays at 07:30"],
  ["30 7 * * 7", "Sundays at 07:30"],
  ["0 9 1 * *", "0 9 1 * *"],
  ["*/20 8-19 * * 1", "*/20 8-19 * * 1"],
  ["0 19 * * 9", "0 19 * * 9"],
  ["not a cron", "not a cron"],
];

for (const [cron, label] of cases) {
  test(`label of "${cron}"`, () => assert.equal(cronLabel(cron), label));
}
