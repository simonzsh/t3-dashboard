import { test } from "bun:test";
import assert from "node:assert/strict";
import type { UpdateStatus } from "../../shared/api.ts";
import { updateLabel, updateQuestion, versionNote, waitForRestart, type RestartProbe } from "../src/updateFlow.ts";

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  current: "1.0.0", latest: "1.1.0", available: true, canUpdate: true, reason: null, updating: false, error: null, ...over,
});

function probe(steps: Array<{ health?: string | null; status?: UpdateStatus | null }>) {
  let clock = 0;
  let i = 0;
  const sleeps: number[] = [];
  const impl: RestartProbe = {
    health: async () => steps[Math.min(i, steps.length - 1)]!.health ?? null,
    status: async () => steps[Math.min(i++, steps.length - 1)]!.status ?? null,
    sleep: async (ms) => void (sleeps.push(ms), (clock += ms)),
    now: () => clock,
  };
  return { impl, sleeps };
}

test("waitForRestart ends when health answers with another version", async () => {
  const { impl } = probe([{ health: "1.0.0", status: status({ updating: true }) }, { health: null }, { health: "1.1.0" }]);
  assert.deepEqual(await waitForRestart("1.0.0", impl), { kind: "restarted" });
});

test("waitForRestart reports the error of a failed update", async () => {
  const { impl } = probe([{ health: "1.0.0", status: status({ updating: true }) }, { health: "1.0.0", status: status({ error: "Checksum mismatch" }) }]);
  assert.deepEqual(await waitForRestart("1.0.0", impl), { kind: "failed", message: "Checksum mismatch" });
});

test("an error that is still being replaced by a running update is not final", async () => {
  const { impl } = probe([{ health: "1.0.0", status: status({ updating: true, error: "old" }) }, { health: "1.1.0" }]);
  assert.deepEqual(await waitForRestart("1.0.0", impl), { kind: "restarted" });
});

test("waitForRestart gives up with a clear message", async () => {
  const { impl, sleeps } = probe([{ health: "1.0.0", status: status({ updating: true }) }]);
  const outcome = await waitForRestart("1.0.0", impl);
  assert.equal(outcome.kind, "failed");
  assert.match((outcome as { message: string }).message, /Restart it by hand/);
  assert.equal(sleeps.length, 90);
});

test("labels name the target version", () => {
  assert.equal(updateLabel(status()), "Update v1.1.0");
  assert.equal(updateQuestion(status()), "Update to v1.1.0?");
});

test("versionNote tells apart dev, available, current and unknown", () => {
  assert.match(versionNote(status({ current: "dev", available: false, canUpdate: false })), /^Development build/);
  assert.equal(versionNote(status()), "Version 1.1.0 is available.");
  assert.equal(versionNote(status({ available: false, latest: "1.0.0" })), "Up to date");
  assert.equal(versionNote(status({ available: false, latest: null })), "No release found yet.");
});
