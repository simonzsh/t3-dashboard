import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalButtons } from "../../../src/features/conversation/ApprovalButtons.tsx";

const render = (props: Partial<Parameters<typeof ApprovalButtons>[0]> = {}) => renderToStaticMarkup(<ApprovalButtons threadId="t" requestId="r" {...props} />);

test("Decline comes first and the primary Accept last", () => {
  const out = render();
  const at = (label: string) => out.indexOf(`>${label}<`);
  assert.ok(at("Decline") >= 0 && at("Decline") < at("Accept for session") && at("Accept for session") < at("Accept"));
  assert.match(out.match(/<button[^>]*>Accept</)![0], /primary/);
  assert.doesNotMatch(out.match(/<button[^>]*>Decline</)![0], /primary/);
});

test("every button is enabled while idle and disabled when the owner disables them", () => {
  assert.doesNotMatch(render(), /disabled/);
  assert.equal(render({ disabled: true }).match(/disabled=""/g)?.length, 3);
});

test("size reaches the buttons", () => {
  assert.equal(render({ size: "sm" }).match(/class="btn sm/g)?.length, 3);
  assert.equal(render().match(/class="btn md/g)?.length, 3);
});
