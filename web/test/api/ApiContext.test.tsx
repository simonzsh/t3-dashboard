import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiProvider, useApi } from "../../src/api/ApiContext.tsx";
import { api, createApi } from "../../src/api/client.ts";

function Probe({ expected }: { expected: unknown }) {
  return <span>{useApi() === expected ? "same" : "other"}</span>;
}

test("useApi gives the real api without a provider", () => {
  assert.equal(renderToStaticMarkup(<Probe expected={api} />), "<span>same</span>");
});

test("a provider swaps in another api, such as a fake for a test", () => {
  const fake = createApi(async () => new Response("{}"));
  assert.equal(renderToStaticMarkup(<ApiProvider value={fake}><Probe expected={fake} /></ApiProvider>), "<span>same</span>");
});
