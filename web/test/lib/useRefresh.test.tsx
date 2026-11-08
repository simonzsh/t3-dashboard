import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useRefresh } from "../../src/lib/useRefresh.ts";

test("useRefresh starts idle", () => {
  function Probe() {
    const { refreshing } = useRefresh(async () => {});
    return <i>{String(refreshing)}</i>;
  }
  assert.equal(renderToStaticMarkup(<Probe />), "<i>false</i>");
});
