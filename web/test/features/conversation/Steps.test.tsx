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

test("only the latest running card is active, without a rail", () => {
  const out = renderToStaticMarkup(<WorkGroup steps={[step("a", { status: "running" }), step("b"), step("c", { status: "running", completedAt: null })]} threadId="t" live />);
  assert.match(out, /data-work-step="c" data-active-step="true"/);
  assert.equal(out.match(/data-active-step=/g)?.length, 1);
  assert.doesNotMatch(out, /step-marker/);
  assert.match(out, /class="work-group-heading"/);
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
  assert.match(out, /step command done arrived-live/);
  assert.doesNotMatch(out, /class="pulse"|data-active-step|step command running/);
});

test("the robot follows live activity and leaves finished groups", () => {
  const render = (kind: TurnStep["kind"], live: boolean) => renderToStaticMarkup(
    <WorkGroup steps={[step("a", { kind, status: "running", completedAt: null })]} threadId="t" live={live} />,
  );
  assert.match(render("command", true), /working-robot typing/);
  assert.match(render("thinking", true), /working-robot thinking/);
  assert.doesNotMatch(render("command", false), /working-robot/);
});


test("loading completed history does not replay the completion effect", () => {
  const out = renderToStaticMarkup(<WorkGroup steps={[step("old")]} threadId="t" live />);
  assert.doesNotMatch(out, /arrived-live/);
});

test("fast commands keep typing through later thinking and outside the visible steps", () => {
  const history = [step("fast"), ...Array.from({ length: 5 }, (_, i) => step(String(i), { kind: "thinking" }))];
  const out = renderToStaticMarkup(<WorkGroup steps={history} threadId="t" live />);
  assert.match(out, /working-robot typing/);
  const next = renderToStaticMarkup(<WorkGroup steps={[step("thought", { kind: "thinking" })]} typing threadId="t" live />);
  assert.match(next, /working-robot typing/);
  const fresh = renderToStaticMarkup(<WorkGroup steps={[step("thought", { kind: "thinking" })]} typing={false} threadId="t" live />);
  assert.match(fresh, /working-robot thinking/);
});

test("a failed command makes the robot think until the next action", () => {
  const failed = step("failed", { status: "failed", exitCode: 1 });
  const thoughts = step("thoughts", { kind: "thinking", status: "running", completedAt: null });
  const render = (steps: TurnStep[], live = true) => renderToStaticMarkup(<WorkGroup steps={steps} threadId="t" live={live} />);
  assert.match(render([failed]), /working-robot thinking/);
  assert.match(render([failed, thoughts, step("notice", { kind: "notice" })]), /working-robot thinking/);
  assert.match(render([failed, thoughts, step("retry", { status: "running", completedAt: null })]), /working-robot typing/);
  assert.match(render([failed, thoughts, step("fast")]), /working-robot typing/);
  assert.doesNotMatch(render([failed], false), /working-robot/);
});
