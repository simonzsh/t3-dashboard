import assert from "node:assert/strict";
import { test } from "bun:test";
import { environmentIdFile, readEnvironmentId, readServerVersion, resolveOrigin, runtimeFile } from "../../../src/integrations/t3/runtime.ts";
import { files } from "../../helpers/files.ts";

test("defaults use the user data runtime file", () => {
  assert.equal(runtimeFile({}, "/home/ann"), "/home/ann/.t3/userdata/server-runtime.json");
  assert.equal(environmentIdFile({}, "/home/ann"), "/home/ann/.t3/userdata/environment-id");
});

test("T3CODE_HOME moves the runtime file too", () => {
  assert.equal(runtimeFile({ T3CODE_HOME: "/srv/t3" }, "/home/ann"), "/srv/t3/userdata/server-runtime.json");
});

test("T3_SERVER_RUNTIME beats T3CODE_HOME", () => {
  assert.equal(runtimeFile({ T3CODE_HOME: "/srv/t3", T3_SERVER_RUNTIME: "/x/r.json" }, "/home/ann"), "/x/r.json");
});

test("T3CODE_HOME moves the environment id file", () => {
  assert.equal(environmentIdFile({ T3CODE_HOME: "/srv/t3" }, "/home/ann"), "/srv/t3/userdata/environment-id");
});

test("readEnvironmentId trims a UUID-like id and refuses anything else", () => {
  const id = "0f3c2a1b-9d8e-4c7b-a6f5-1e2d3c4b5a69";
  assert.equal(readEnvironmentId("/e", files({ "/e": ` ${id}\n` })), id);
  assert.equal(readEnvironmentId("/e", files({ "/e": "not-an-id" })), null);
  assert.equal(readEnvironmentId("/e", files({ "/e": `${id}/../x` })), null);
  assert.equal(readEnvironmentId("/e", files({})), null);
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

test("a wrongly typed field falls back on its own and leaves the other field readable", () => {
  const read = () => JSON.stringify({ origin: 5, serverVersion: "0.3.0" });
  assert.equal(resolveOrigin("/r", read), "http://127.0.0.1:3773");
  assert.equal(readServerVersion("/r", read), "0.3.0");
});
