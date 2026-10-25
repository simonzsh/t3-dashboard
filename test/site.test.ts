import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import type { HTMLBundle } from "bun";
import { siteFromBundle } from "../src/site.ts";

function fakeBundle() {
  const dir = mkdtempSync(join(tmpdir(), "t3-dashboard-site-"));
  const write = (name: string, content: string) => {
    writeFileSync(join(dir, name), content);
    return join(dir, name);
  };
  const files = [
    { path: write("chunk-abc.js", "console.log(1)"), headers: { "content-type": "text/javascript;charset=utf-8" } },
    { path: write("index-abc.html", "<p>app</p>"), headers: { "content-type": "text/html;charset=utf-8" } },
    { path: write("chunk-abc.css", "a{}"), headers: { "content-type": "text/css;charset=utf-8" } },
    { path: write("favicon-32-abc.png", "png"), headers: { "content-type": "image/png" } },
  ];
  write("secret.txt", "top secret");
  return { files } as unknown as HTMLBundle;
}

test("a compiled bundle is served from its files with their headers", async () => {
  const site = siteFromBundle(fakeBundle());
  assert.equal(site.devRoutes, undefined);
  const page = (await site.serve("/"))!;
  assert.equal(await page.text(), "<p>app</p>");
  assert.match(page.headers.get("content-type")!, /text\/html/);
  const js = (await site.serve("/chunk-abc.js"))!;
  assert.equal(await js.text(), "console.log(1)");
  assert.match(js.headers.get("content-type")!, /text\/javascript/);
  assert.match((await site.serve("/chunk-abc.css"))!.headers.get("content-type")!, /text\/css/);
});

test("client-side routes fall back to the page; unknown files do not", async () => {
  const site = siteFromBundle(fakeBundle());
  assert.equal(await (await site.serve("/some/client/route"))!.text(), "<p>app</p>");
  assert.equal(await site.serve("/missing.js"), null);
});

test("paths cannot reach files outside the bundle", async () => {
  const site = siteFromBundle(fakeBundle());
  for (const path of ["/../secret.txt", "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/secret.txt"]) {
    assert.equal(await site.serve(path), null, path);
  }
});

test("a bundle without files (running from source) is left to Bun's dev routes", async () => {
  const bundle = {} as HTMLBundle;
  const site = siteFromBundle(bundle);
  assert.deepEqual(site.devRoutes, { "/": bundle });
  assert.equal(await site.serve("/"), null);
});

test("/favicon.ico answers with the bundled PNG icon", async () => {
  const site = siteFromBundle(fakeBundle());
  const response = await site.serve("/favicon.ico");
  assert.equal(response?.headers.get("content-type"), "image/png");
  assert.equal(await response?.text(), "png");
});
