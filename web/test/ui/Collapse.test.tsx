import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Collapse } from "../../src/ui/Collapse.tsx";

test("a closed disclosure does not mount or expose its content", () => {
  const out = renderToStaticMarkup(<Collapse open={false}><a href="/">Details</a></Collapse>);
  assert.match(out, /inert=""/);
  assert.match(out, /aria-hidden="true"/);
  assert.doesNotMatch(out, /Details/);
});

test("an open disclosure mounts accessible content", () => {
  const out = renderToStaticMarkup(<Collapse open><a href="/">Details</a></Collapse>);
  assert.match(out, /Details/);
  assert.match(out, /aria-hidden="false"/);
  assert.doesNotMatch(out, /inert=/);
});
