import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { queuedSendBlockedReason } from "../../../../shared/status.ts";
import { QueuedMessages } from "../../../src/features/conversation/QueuedMessages.tsx";

const source = readFileSync(new URL("../../../src/features/conversation/QueuedMessages.tsx", import.meta.url), "utf8");

test("queued message editing uses the composer's Enter policy and prevents a newline before saving", () => {
  assert.match(source, /import \{ isSendKey \} from "\.\/composer\.ts"/);
  assert.match(source, /const touch = useMediaQuery\(TOUCH\)/);
  assert.match(source, /if \(isSendKey\(\{ key: e\.key, shiftKey: e\.shiftKey, isComposing: e\.nativeEvent\.isComposing \}, touch\)\) \{\s*e\.preventDefault\(\);\s*void save\(\);/);
});

test("keyboard saves cannot submit an empty draft or save during an update", () => {
  assert.match(source, /const save = async \(\) => \{\s*if \(busy \|\| draft\.trim\(\) === ""\) return;/);
});

test("a waiting run disables Send now but keeps edit and remove available", () => {
  for (const status of ["waiting", "running", "completed"]) {
    const html = renderToStaticMarkup(<QueuedMessages threadId="t" queue={[{ runId: "q1", messageId: "m1", createdAt: "2026-11-10T12:00:00Z", text: "Follow up", attachments: [], editable: true }]} held={false} sendBlockedReason={queuedSendBlockedReason(status)} onChanged={() => {}} />);
    const send = html.match(/<button[^>]*aria-label="Send now"[^>]*>/)?.[0] ?? "";
    assert.ok(send);
    assert.equal(send.includes("disabled"), status === "waiting");
    for (const label of ["Edit queued message", "Remove from queue"]) {
      const button = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
      assert.ok(button);
      assert.equal(button.includes("disabled"), false);
    }
  }
});
