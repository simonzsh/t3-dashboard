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
});
