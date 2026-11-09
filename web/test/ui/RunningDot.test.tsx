import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RunningDot } from "../../src/ui/RunningDot.tsx";

test("a running dot is decorative beside text and can name a standalone indicator", () => {
  assert.equal(renderToStaticMarkup(<RunningDot />), '<span class="pulse" aria-hidden="true"></span>');
  assert.equal(renderToStaticMarkup(<RunningDot className="run-pulse" label="Running" />), '<span class="pulse run-pulse" role="img" aria-label="Running"></span>');
});
