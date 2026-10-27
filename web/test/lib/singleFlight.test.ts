import { test } from "bun:test";
import assert from "node:assert/strict";
import { singleFlight } from "../../src/lib/singleFlight.ts";

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

test("calls during a run share it and trigger exactly one trailing run", async () => {
  let runs = 0;
  const gates = [gate(), gate()];
  const call = singleFlight(async () => {
    await gates[runs++]!.opened;
  });
  const first = call();
  const second = call();
  const third = call();
  assert.equal(second, first);
  assert.equal(third, first);
  gates[0]!.open();
  await Promise.resolve();
  await Promise.resolve();
  gates[1]!.open();
  await Promise.all([first, second, third]);
  assert.equal(runs, 2);
});

test("no trailing run without extra calls", async () => {
  let runs = 0;
  const call = singleFlight(async () => void runs++);
  await call();
  assert.equal(runs, 1);
  await call();
  assert.equal(runs, 2);
});

test("a rejection propagates and does not block later calls", async () => {
  let runs = 0;
  const call = singleFlight(async () => {
    if (runs++ === 0) throw new Error("boom");
  });
  await assert.rejects(call(), /boom/);
  await call();
  assert.equal(runs, 2);
});
