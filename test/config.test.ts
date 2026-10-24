import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig, resolveOrigin } from "../src/config.ts";

const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

test("defaults point at the perso token file and the user data runtime file", () => {
  const config = loadConfig({}, files({}), "/home/ann");
  assert.equal(config.port, 4310);
  assert.equal(config.tokenFile, "/home/ann/.config/t3-agent/perso.json");
  assert.equal(config.runtimeFile, "/home/ann/.t3/userdata/server-runtime.json");
});

test("environment variables override the defaults", () => {
  const config = loadConfig({ PORT: "4999", T3_DASHBOARD_TOKEN_FILE: "/x/t.json", T3_SERVER_RUNTIME: "/x/r.json" }, files({}), "/home/ann");
  assert.deepEqual([config.port, config.tokenFile, config.runtimeFile], [4999, "/x/t.json", "/x/r.json"]);
});

test("readToken reads the token field", () => {
  const config = loadConfig({ T3_DASHBOARD_TOKEN_FILE: "/x/t.json" }, files({ "/x/t.json": '{"token":"abc"}' }), "/h");
  assert.equal(config.readToken(), "abc");
});

test("missing token file names the path", () => {
  const config = loadConfig({ T3_DASHBOARD_TOKEN_FILE: "/x/t.json" }, files({}), "/h");
  assert.throws(() => config.readToken(), /\/x\/t\.json/);
});

test("missing token field names the path and never prints file content", () => {
  const config = loadConfig({ T3_DASHBOARD_TOKEN_FILE: "/x/t.json" }, files({ "/x/t.json": '{"other":"secret-value"}' }), "/h");
  assert.throws(
    () => config.readToken(),
    (error: Error) => error.message.includes("/x/t.json") && !error.message.includes("secret-value"),
  );
});

test("invalid JSON in the token file does not leak its content", () => {
  const config = loadConfig({ T3_DASHBOARD_TOKEN_FILE: "/x/t.json" }, files({ "/x/t.json": "tok-123 not json" }), "/h");
  assert.throws(
    () => config.readToken(),
    (error: Error) => error.message.includes("/x/t.json") && !error.message.includes("tok-123"),
  );
});

test("resolveOrigin reads the origin field", () => {
  assert.equal(resolveOrigin("/r.json", files({ "/r.json": '{"origin":"http://127.0.0.1:4000"}' })), "http://127.0.0.1:4000");
});

test("resolveOrigin falls back when the file or field is missing", () => {
  assert.equal(resolveOrigin("/r.json", files({})), "http://127.0.0.1:3773");
  assert.equal(resolveOrigin("/r.json", files({ "/r.json": "{}" })), "http://127.0.0.1:3773");
  assert.equal(resolveOrigin("/r.json", files({ "/r.json": "garbage" })), "http://127.0.0.1:3773");
});
