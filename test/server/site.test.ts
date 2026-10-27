import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { test } from "bun:test";
import type { HTMLBundle } from "bun";
import { pickEncoding, siteFromBundle, type Site } from "../../src/server/site.ts";

const BIG_JS = "export const answer = () => 42;\n".repeat(200);

const get = (site: Site, path: string, headers: Record<string, string> = {}) => site.serve(path, new Request(`http://127.0.0.1${path}`, { headers }));

function fakeBundle() {
  const dir = mkdtempSync(join(tmpdir(), "t3-dashboard-site-"));
  const write = (name: string, content: string) => {
    writeFileSync(join(dir, name), content);
    return join(dir, name);
  };
  const files = [
    { path: write("chunk-abc.js", BIG_JS), headers: { "content-type": "text/javascript;charset=utf-8" } },
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
  const page = (await get(site, "/"))!;
  assert.equal(await page.text(), "<p>app</p>");
  assert.match(page.headers.get("content-type")!, /text\/html/);
  const js = (await get(site, "/chunk-abc.js"))!;
  assert.equal(await js.text(), BIG_JS);
  assert.match(js.headers.get("content-type")!, /text\/javascript/);
  assert.match((await get(site, "/chunk-abc.css"))!.headers.get("content-type")!, /text\/css/);
});

test("client-side routes fall back to the page; unknown files do not", async () => {
  const site = siteFromBundle(fakeBundle());
  assert.equal(await (await get(site, "/some/client/route"))!.text(), "<p>app</p>");
  assert.equal(await get(site, "/missing.js"), null);
});

test("paths cannot reach files outside the bundle", async () => {
  const site = siteFromBundle(fakeBundle());
  for (const path of ["/../secret.txt", "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/secret.txt"]) {
    assert.equal(await get(site, path), null, path);
  }
});

test("a bundle without files (running from source) is left to Bun's dev routes", async () => {
  const bundle = {} as HTMLBundle;
  const site = siteFromBundle(bundle);
  assert.deepEqual(site.devRoutes, { "/": bundle });
  assert.equal(await get(site, "/"), null);
});

test("/favicon.ico answers with the bundled PNG icon", async () => {
  const site = siteFromBundle(fakeBundle());
  const response = await get(site, "/favicon.ico");
  assert.equal(response?.headers.get("content-type"), "image/png");
  assert.equal(await response?.text(), "png");
});

test("pickEncoding prefers br, then gzip, and honours q=0", () => {
  assert.equal(pickEncoding(null), null);
  assert.equal(pickEncoding(""), null);
  assert.equal(pickEncoding("gzip, deflate, br"), "br");
  assert.equal(pickEncoding("gzip, deflate"), "gzip");
  assert.equal(pickEncoding("br;q=0, gzip"), "gzip");
  assert.equal(pickEncoding("br;q=0, gzip;q=0"), null);
  assert.equal(pickEncoding("identity"), null);
  assert.equal(pickEncoding("*"), "br");
  assert.equal(pickEncoding("GZIP;Q=0.5"), "gzip");
});

test("a client that accepts br gets brotli, with vary and an etag of its own", async () => {
  const site = siteFromBundle(fakeBundle());
  const response = (await get(site, "/chunk-abc.js", { "accept-encoding": "gzip, br" }))!;
  assert.equal(response.headers.get("content-encoding"), "br");
  assert.equal(response.headers.get("vary"), "accept-encoding");
  assert.match(response.headers.get("etag")!, /^"[0-9a-z]+-br"$/);
  assert.equal(brotliDecompressSync(Buffer.from(await response.arrayBuffer())).toString(), BIG_JS);
});

test("a client that accepts only gzip gets gzip", async () => {
  const site = siteFromBundle(fakeBundle());
  const response = (await get(site, "/chunk-abc.js", { "accept-encoding": "gzip" }))!;
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assert.match(response.headers.get("etag")!, /-gz"$/);
  assert.equal(gunzipSync(Buffer.from(await response.arrayBuffer())).toString(), BIG_JS);
});

test("without an accepted encoding the file goes out as it is", async () => {
  const site = siteFromBundle(fakeBundle());
  for (const headers of [{} as Record<string, string>, { "accept-encoding": "br;q=0, gzip;q=0" }]) {
    const response = (await get(site, "/chunk-abc.js", headers))!;
    assert.equal(response.headers.get("content-encoding"), null);
    assert.equal(response.headers.get("vary"), "accept-encoding");
    assert.equal(await response.text(), BIG_JS);
  }
});

test("a binary file is never encoded and carries no vary", async () => {
  const site = siteFromBundle(fakeBundle());
  const response = (await get(site, "/favicon-32-abc.png", { "accept-encoding": "br, gzip" }))!;
  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("vary"), null);
});

test("hashed assets are immutable; the page and client routes revalidate", async () => {
  const site = siteFromBundle(fakeBundle());
  assert.equal((await get(site, "/chunk-abc.js"))!.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await get(site, "/chunk-abc.css"))!.headers.get("cache-control"), "public, max-age=31536000, immutable");
  for (const path of ["/", "/some/client/route"]) {
    const response = (await get(site, path))!;
    assert.equal(response.headers.get("cache-control"), "no-cache", path);
    assert.ok(response.headers.get("etag"), path);
  }
  assert.equal((await get(site, "/favicon.ico"))!.headers.get("cache-control"), "public, max-age=86400");
});

test("a matching if-none-match gets 304 without a body", async () => {
  const site = siteFromBundle(fakeBundle());
  const etag = (await get(site, "/"))!.headers.get("etag")!;
  const same = (await get(site, "/", { "if-none-match": etag }))!;
  assert.deepEqual([same.status, await same.text(), same.headers.get("etag")], [304, "", etag]);
  assert.equal((await get(site, "/", { "if-none-match": '"other"' }))!.status, 200);
  const br = (await get(site, "/chunk-abc.js", { "accept-encoding": "br" }))!.headers.get("etag")!;
  assert.equal((await get(site, "/chunk-abc.js", { "accept-encoding": "br", "if-none-match": br }))!.status, 304);
  assert.equal((await get(site, "/chunk-abc.js", { "if-none-match": br }))!.status, 200);
});
