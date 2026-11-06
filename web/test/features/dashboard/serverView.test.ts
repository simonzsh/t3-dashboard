import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ServerStats } from "../../../../shared/api.ts";
import { formatBytesPair, hostLine, meterText, percentLabel, uptimeLabel } from "../../../src/features/dashboard/serverView.ts";

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

test("byte pairs use the unit of the total; numbers under 100 get one decimal", () => {
  assert.equal(formatBytesPair(3.9 * GIB, 15.6 * GIB), "3.9 of 15.6 GB");
  assert.equal(formatBytesPair(168 * GIB, 211 * GIB), "168 of 211 GB");
  assert.equal(formatBytesPair(1.2 * TIB, 1.8 * TIB), "1.2 of 1.8 TB");
  assert.equal(formatBytesPair(300 * 1024 ** 2, 512 * 1024 ** 2), "300 of 512 MB");
  assert.equal(formatBytesPair(0.5 * GIB, 4 * GIB), "0.5 of 4.0 GB");
});

test("a value that rounds up to 100 loses its decimal", () => {
  assert.equal(formatBytesPair(99.96 * GIB, 200 * GIB), "100 of 200 GB");
});

test("uptime shows the largest whole unit", () => {
  assert.equal(uptimeLabel(19 * 86_400 + 5 * 3600), "up 19 d");
  assert.equal(uptimeLabel(5 * 3600 + 59 * 60), "up 5 h");
  assert.equal(uptimeLabel(12 * 60 + 30), "up 12 min");
  assert.equal(uptimeLabel(20), "up <1 min");
});

test("the host line joins host, OS and uptime", () => {
  const stats = { host: "devbox", os: "Linux", uptimeSeconds: 19 * 86_400 } as ServerStats;
  assert.equal(hostLine(stats), "devbox · Linux · up 19 d");
});

test("a percent rounds, and an unknown one is a dash", () => {
  assert.equal(percentLabel(22.6), "23%");
  assert.equal(percentLabel(null), "—");
});

test("the meter text names the metric, the percent and the detail", () => {
  assert.equal(meterText("Memory", 25.4, "3.9 of 15.6 GB"), "Memory: 25% used, 3.9 of 15.6 GB");
  assert.equal(meterText("CPU", 7), "CPU: 7% used");
});
