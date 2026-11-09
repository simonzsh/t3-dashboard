import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Icon } from "../../src/ui/Icon.tsx";

test("archive actions provide distinct icons and preserve accessible names", () => {
  const settle = renderToStaticMarkup(<Icon name="archive" label="Settle" />);
  const restore = renderToStaticMarkup(<Icon name="archiveRestore" label="Unsettle" />);
  assert.match(restore, /role="img" aria-label="Unsettle"/);
  assert.notEqual(settle.replace("Settle", ""), restore.replace("Unsettle", ""));
  assert.match(renderToStaticMarkup(<Icon name="archiveRestore" />), /aria-hidden="true"/);
});
