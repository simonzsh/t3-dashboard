import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { TurnStep } from "../../../../shared/api.ts";
import { WorkGroup } from "../../../src/features/conversation/Steps.tsx";

const step = (id: string, over: Partial<TurnStep> = {}): TurnStep => ({ id, runId: null, kind: "command", status: "done", startedAt: "2026-01-01T10:00:00Z", completedAt: "2026-01-01T10:00:03Z", text: `cmd ${id}`, detail: null, expandable: true, exitCode: null, ...over });
const steps = ["a", "b", "c", "d", "e", "f"].map((id) => step(id));

test("a finished group is collapsed and shows its count and time", () => {
  const out = renderToStaticMarkup(<WorkGroup steps={steps} threadId="t" live={false} />);
  assert.match(out, /6 steps · 3s/);
  assert.doesNotMatch(out, /cmd a/);
  assert.match(out, /aria-expanded="false"/);
});

test("the live group shows its last four steps", () => {
  const out = renderToStaticMarkup(<WorkGroup steps={steps} threadId="t" live />);
  assert.match(out, /Working for /);
  for (const id of ["c", "d", "e", "f"]) assert.match(out, new RegExp(`cmd ${id}`));
  for (const id of ["a", "b"]) assert.doesNotMatch(out, new RegExp(`cmd ${id}`));
});

test("a failed command shows its exit code", () => {
  const out = renderToStaticMarkup(<WorkGroup steps={[step("x", { status: "failed", exitCode: 2 })]} threadId="t" live />);
  assert.match(out, /exit 2/);
  assert.doesNotMatch(out, /aria-label="Completed"/);
});

test("only the latest running step gets the rail marker target", () => {
  const out = renderToStaticMarkup(<WorkGroup steps={[step("a", { status: "running" }), step("b"), step("c", { status: "running", completedAt: null })]} threadId="t" live />);
  assert.match(out, /data-work-step="c" data-active-step="true"/);
  assert.equal(out.match(/data-active-step=/g)?.length, 1);
  assert.match(out, /class="step-marker" aria-hidden="true"/);
  assert.match(out, /class="pulse" aria-hidden="true"/);
});

test("completed steps keep their action and show the completion icon and duration", () => {
  const out = renderToStaticMarkup(<WorkGroup steps={[step("a")]} threadId="t" live />);
  assert.match(out, /cmd a/);
  assert.match(out, /class="step-result"><svg[^>]*aria-label="Completed"/);
  assert.match(out, /<\/svg>3s<\/span>/);
  assert.doesNotMatch(out, /data-active-step=/);
});

test("a newly received finished group reveals fast completed steps without a running state", () => {
  const fast = step("fast", { completedAt: "2026-01-01T10:00:00Z" });
  const out = renderToStaticMarkup(<WorkGroup steps={[fast]} threadId="t" live={false} fresh />);
  assert.match(out, /cmd fast/);
  assert.match(out, /1 step · 0s/);
  assert.match(out, /&lt;1s/);
  assert.match(out, /aria-label="Completed"/);
  assert.doesNotMatch(out, /class="pulse"|data-active-step|step command running/);
});
