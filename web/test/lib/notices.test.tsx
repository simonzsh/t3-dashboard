import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBanner } from "../../src/lib/notices.tsx";

test("nothing shows without a notice", () => {
  assert.equal(renderToStaticMarkup(<ErrorBanner notices={[]} onDismiss={() => {}} />), "");
});

test("each notice is an alert line with a dismiss button", () => {
  const out = renderToStaticMarkup(<ErrorBanner notices={[{ id: 1, message: "Could not send" }, { id: 2, message: "Offline" }]} onDismiss={() => {}} />);
  assert.match(out, /role="alert"/);
  assert.match(out, /Could not send/);
  assert.match(out, /Offline/);
  assert.equal(out.match(/aria-label="Dismiss"/g)?.length, 2);
});
