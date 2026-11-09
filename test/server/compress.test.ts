import assert from "node:assert/strict";
import { test } from "bun:test";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { compressJson } from "../../src/server/compress.ts";

const BIG = JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `row ${i}` })) });
const json = (body: string, init: ResponseInit = {}) => new Response(body, { ...init, headers: { "content-type": "application/json; charset=utf-8", ...init.headers } });
const asking = (encoding?: string, method = "GET") => new Request("http://localhost/api/x", { method, headers: encoding ? { "accept-encoding": encoding } : {} });

test("a small body stays plain and tells caches it varies", async () => {
  const res = await compressJson(asking("gzip"), json('{"ok":true}'));
  assert.equal(res.headers.get("content-encoding"), null);
  assert.equal(res.headers.get("vary"), "accept-encoding");
  assert.equal(await res.text(), '{"ok":true}');
});

test("a big body is gzipped for a client that accepts gzip, other headers kept", async () => {
  const res = await compressJson(asking("gzip"), json(BIG, { status: 201, headers: { etag: 'W/"a"', "content-length": String(BIG.length) } }));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("content-encoding"), "gzip");
  assert.equal(res.headers.get("content-length"), null);
  assert.equal(res.headers.get("etag"), 'W/"a"');
  assert.equal(res.headers.get("vary"), "accept-encoding");
  assert.equal(gunzipSync(await res.arrayBuffer()).toString(), BIG);
});

test("br wins over gzip", async () => {
  const res = await compressJson(asking("gzip, br"), json(BIG));
  assert.equal(res.headers.get("content-encoding"), "br");
  assert.equal(brotliDecompressSync(await res.arrayBuffer()).toString(), BIG);
});

test("a client without accept-encoding gets the plain body", async () => {
  const res = await compressJson(asking(), json(BIG));
  assert.equal(res.headers.get("content-encoding"), null);
  assert.equal(await res.text(), BIG);
});

test("an event stream comes back untouched, its body unread", async () => {
  const source = new Response(new ReadableStream(), { headers: { "content-type": "text/event-stream" } });
  const res = await compressJson(asking("gzip"), source);
  assert.equal(res, source);
  assert.equal(source.bodyUsed, false);
  assert.equal(source.body!.locked, false);
});

test("a partial answer, an encoded answer and a 304 come back untouched", async () => {
  const partial = json(BIG, { status: 206, headers: { "content-range": "bytes 0-9/100" } });
  const ranged = json(BIG, { headers: { "content-range": "bytes 0-9/100" } });
  const encoded = json(BIG, { headers: { "content-encoding": "gzip" } });
  const notModified = new Response(null, { status: 304, headers: { "content-type": "application/json" } });
  for (const source of [partial, ranged, encoded, notModified]) assert.equal(await compressJson(asking("gzip"), source), source);
});

test("a HEAD request comes back untouched", async () => {
  const source = json(BIG);
  assert.equal(await compressJson(asking("gzip", "HEAD"), source), source);
});
