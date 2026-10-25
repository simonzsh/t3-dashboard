import assert from "node:assert/strict";
import { test } from "bun:test";
import { loadConfig, readServerVersion, resolveOrigin } from "../src/config.ts";

const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

test("defaults use the user data runtime file and no token file", () => {
  const config = loadConfig({}, "/home/ann");
  assert.equal(config.port, 4310);
  assert.equal(config.tokenFile, null);
  assert.equal(config.runtimeFile, "/home/ann/.t3/userdata/server-runtime.json");
});

test("environment variables override the defaults", () => {
  const config = loadConfig({ PORT: "4999", T3_DASHBOARD_TOKEN_FILE: "/x/t.json", T3_SERVER_RUNTIME: "/x/r.json" }, "/home/ann");
  assert.deepEqual([config.port, config.tokenFile, config.runtimeFile], [4999, "/x/t.json", "/x/r.json"]);
});

test("an empty token file variable means no token file", () => {
  assert.equal(loadConfig({ T3_DASHBOARD_TOKEN_FILE: "" }, "/h").tokenFile, null);
});

test("resolveOrigin reads the origin field", () => {
  assert.equal(resolveOrigin("/r.json", files({ "/r.json": '{"origin":"http://127.0.0.1:4000"}' })), "http://127.0.0.1:4000");
});

test("resolveOrigin falls back when the file or field is missing", () => {
  assert.equal(resolveOrigin("/r.json", files({})), "http://127.0.0.1:3773");
  assert.equal(resolveOrigin("/r.json", files({ "/r.json": "{}" })), "http://127.0.0.1:3773");
  assert.equal(resolveOrigin("/r.json", files({ "/r.json": "garbage" })), "http://127.0.0.1:3773");
});

test("readServerVersion reads serverVersion, or null", () => {
  assert.equal(readServerVersion("/r", () => JSON.stringify({ serverVersion: "0.2.0" })), "0.2.0");
  assert.equal(readServerVersion("/r", () => "{}"), null);
  assert.equal(readServerVersion("/r", () => { throw new Error("ENOENT"); }), null);
});
