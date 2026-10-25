import assert from "node:assert/strict";
import { test } from "node:test";
import { cronLabel } from "../src/cronLabel.ts";

const cases: Array<[string, string]> = [
  ["*/20 * * * *", "toutes les 20 min"],
  ["*/20 8-19 * * *", "toutes les 20 min, 8h-19h"],
  ["0 23 * * *", "tous les jours à 23:00"],
  ["5 9 * * *", "tous les jours à 09:05"],
  ["0 19 * * 1-5", "jours ouvrés à 19:00"],
  ["0 18 * * 4", "le jeudi à 18:00"],
  ["30 7 * * 0", "le dimanche à 07:30"],
  ["30 7 * * 7", "le dimanche à 07:30"],
  ["0 9 1 * *", "0 9 1 * *"],
  ["*/20 8-19 * * 1", "*/20 8-19 * * 1"],
  ["0 19 * * 9", "0 19 * * 9"],
  ["not a cron", "not a cron"],
];

for (const [cron, label] of cases) {
  test(`label of "${cron}"`, () => assert.equal(cronLabel(cron), label));
}
