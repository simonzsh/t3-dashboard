import assert from "node:assert/strict";
import { test } from "bun:test";
import { createSettings } from "../src/settings.ts";
import type { KeyCheck } from "../src/linear.ts";

const FILE = "/cfg/linear.json";
const KEY = "lin_api_abcdefghijWXYZ";

function setup(initial?: unknown, verdict: KeyCheck = "ok") {
  const files: Record<string, string> = initial === undefined ? {} : { [FILE]: JSON.stringify(initial) };
  const calls: string[] = [];
  const settings = createSettings({
    file: FILE,
    configDir: "/cfg",
    readFile: (path) => {
      if (path in files) return files[path]!;
      throw new Error("ENOENT");
    },
    writeSecret: (path, text) => {
      files[path] = text;
    },
    board: {
      invalidate: () => calls.push("invalidate"),
      verifyKey: async (key) => {
        calls.push(`verify:${key}`);
        return verdict;
      },
    },
    tokenSource: () => "issued",
  });
  return { settings, files, calls, saved: () => JSON.parse(files[FILE]!) };
}

test("a new key is verified, then written alone", async () => {
  const { settings, calls, saved } = setup();
  const result = await settings.connectKey({ apiKey: `  ${KEY} ` });
  assert.deepEqual(calls, [`verify:${KEY}`, "invalidate"]);
  assert.deepEqual(saved(), { apiKey: KEY });
  assert.deepEqual(result.linear, { connected: true, keyTail: "WXYZ", legacy: false });
  assert.equal(result.t3.tokenSource, "issued");
  assert.equal(result.configDir, "/cfg");
  assert.ok(!JSON.stringify(result).includes(KEY));
});

test("a refused or unreachable key writes nothing", async () => {
  for (const [verdict, status, message] of [["refused", 400, "Linear refused this key."], ["unreachable", 502, "Linear is unreachable."]] as const) {
    const { settings, files, calls } = setup(undefined, verdict);
    await assert.rejects(settings.connectKey({ apiKey: KEY }), (error: Error & { status?: number }) => error.status === status && error.message === message && !error.message.includes(KEY));
    assert.deepEqual(files, {});
    assert.ok(!calls.includes("invalidate"));
  }
});

test("an empty key is a bad request and is not sent to Linear", async () => {
  const { settings, calls } = setup();
  await assert.rejects(settings.connectKey({ apiKey: "   " }), (error: Error & { status?: number }) => error.status === 400);
  assert.deepEqual(calls, []);
});

test("changing the key drops the teams and unlisted fields of an old file", async () => {
  const { settings, saved } = setup({ apiKey: "old-key-0000", teams: { ENG: "Project A", OPS: null }, unlisted: "hide" });
  assert.deepEqual(settings.get().linear, { connected: true, keyTail: "0000", legacy: false });
  await settings.connectKey({ apiKey: KEY });
  assert.deepEqual(saved(), { apiKey: KEY });
});

test("disconnect empties the key and nothing else stays", () => {
  const { settings, saved } = setup({ apiKey: KEY, teams: { ENG: "Project A" }, unlisted: "hide" });
  const result = settings.disconnect();
  assert.deepEqual(saved(), { apiKey: "" });
  assert.deepEqual(result.linear, { connected: false, keyTail: null, legacy: false });
});

test("with no file the settings say not connected", () => {
  const { settings } = setup();
  assert.deepEqual(settings.get().linear, { connected: false, keyTail: null, legacy: false });
});

test("the key tail is four characters at most", () => {
  const { settings } = setup({ apiKey: "ab" });
  assert.equal(settings.get().linear.keyTail, "ab");
});

test("a legacy file reads as legacy, takes the first non-empty key and converts on the first save", async () => {
  const legacy = { workspaces: [{ name: "A", apiKey: "", teams: { ENG: "Project A" } }, { name: "B", apiKey: "key-b-2222" }] };
  const { settings, saved } = setup(legacy);
  assert.deepEqual(settings.get().linear, { connected: true, keyTail: "2222", legacy: true });
  await settings.connectKey({ apiKey: KEY });
  assert.deepEqual(saved(), { apiKey: KEY });
  assert.equal(settings.get().linear.legacy, false);
});

test("a legacy file with several keys is never rewritten from the UI", async () => {
  const legacy = { workspaces: [{ name: "A", apiKey: "key-a-1111" }, { name: "B", apiKey: "key-b-2222" }] };
  const { settings, saved } = setup(legacy);
  assert.throws(() => settings.disconnect(), /several keys/);
  await assert.rejects(settings.connectKey({ apiKey: "key-new-3333" }), /several keys/);
  assert.deepEqual(saved(), legacy);
});
