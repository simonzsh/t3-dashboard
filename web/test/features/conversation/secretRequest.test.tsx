import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { SecretStatus, TurnStep } from "../../../../shared/api.ts";
import { SecretRequestCard } from "../../../src/features/conversation/SecretRequestCard.tsx";
import { pendingSecrets, saveBody } from "../../../src/features/conversation/secretRequest.ts";

const step = (status: SecretStatus): TurnStep => ({
  id: "item-1", runId: null, kind: "secret", status: status === "pending" ? "running" : "done", startedAt: "", completedAt: null, text: "Webhook secret", detail: null, expandable: false, exitCode: null,
  secret: { label: "Webhook secret", reason: "Sign the webhook", placeholder: "Paste it", status },
});
const render = (status: SecretStatus) => renderToStaticMarkup(<SecretRequestCard step={step(status)} threadId="t" />);

test("saveBody sends the value as typed and refuses a blank or too long one", () => {
  assert.deepEqual(saveBody(" dummy "), { secret: "dummy" });
  assert.equal(saveBody("   "), null);
  assert.equal(saveBody(""), null);
  assert.equal(saveBody("x".repeat(8193)), null);
});

test("a pending request shows the reason, a masked field, Decline and Save", () => {
  const out = render("pending");
  assert.match(out, /Sign the webhook/);
  assert.match(out, /placeholder="Paste it"/);
  assert.match(out, />Decline</);
  assert.match(out, />Save</);
});

test("an answered request shows its status and no field", () => {
  for (const [status, label] of [["saved", "Saved"], ["declined", "Declined"], ["cancelled", "Cancelled"]] as const) {
    const out = render(status);
    assert.match(out, new RegExp(label));
    assert.doesNotMatch(out, /<input|>Save</);
  }
  assert.doesNotMatch(render("pending"), /Saved/);
});

test("only pending secrets move to the composer dock", () => {
  const pending = step("pending");
  assert.deepEqual(pendingSecrets([pending, step("saved"), step("declined"), step("cancelled")]), [pending]);
});
