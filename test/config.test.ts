import assert from "node:assert/strict";
import { test } from "bun:test";
import { loadConfig, readEnvironmentId, readServerVersion, resolveOrigin } from "../src/config.ts";

const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

test("defaults use the user data runtime file and no token file", () => {
  const config = loadConfig({}, "/home/ann");
  assert.equal(config.port, 4300);
  assert.equal(config.tokenFile, null);
  assert.equal(config.runtimeFile, "/home/ann/.t3/userdata/server-runtime.json");
  assert.equal(config.environmentIdFile, "/home/ann/.t3/userdata/environment-id");
});

test("T3CODE_HOME moves the environment id file", () => {
  assert.equal(loadConfig({ T3CODE_HOME: "/srv/t3" }, "/home/ann").environmentIdFile, "/srv/t3/userdata/environment-id");
});

test("readEnvironmentId trims a UUID-like id and refuses anything else", () => {
  const id = "0f3c2a1b-9d8e-4c7b-a6f5-1e2d3c4b5a69";
  assert.equal(readEnvironmentId("/e", files({ "/e": ` ${id}\n` })), id);
  assert.equal(readEnvironmentId("/e", files({ "/e": "not-an-id" })), null);
  assert.equal(readEnvironmentId("/e", files({ "/e": `${id}/../x` })), null);
  assert.equal(readEnvironmentId("/e", files({})), null);
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
