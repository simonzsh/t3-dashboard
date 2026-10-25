import assert from "node:assert/strict";
import { test } from "bun:test";
import { createSettings, parseTeamsBody } from "../src/settings.ts";
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
      listTeams: async () => ({ teams: [{ key: "ENG", name: "Engineering" }] }),
    },
    tokenSource: () => "issued",
  });
  return { settings, files, calls, saved: () => JSON.parse(files[FILE]!) };
}

test("a new key is verified, then written with an empty table that shows every team", async () => {
  const { settings, calls, saved } = setup();
  const result = await settings.connectKey({ apiKey: `  ${KEY} ` });
  assert.deepEqual(calls, [`verify:${KEY}`, "invalidate"]);
  assert.deepEqual(saved(), { apiKey: KEY, teams: {}, unlisted: "show" });
  assert.deepEqual(result.linear, { connected: true, keyTail: "WXYZ", legacy: false, teams: {}, unlisted: "show" });
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

test("changing the key keeps the team table and its unlisted rule", async () => {
  const { settings, saved } = setup({ apiKey: "old-key-0000", teams: { ENG: "Project A", OPS: null }, unlisted: "hide" });
  await settings.connectKey({ apiKey: KEY });
  assert.deepEqual(saved(), { apiKey: KEY, teams: { ENG: "Project A", OPS: null }, unlisted: "hide" });
});

test("a file with a table and no unlisted value keeps hiding unlisted teams once saved", async () => {
  const { settings, saved } = setup({ apiKey: "old-key-0000", teams: { ENG: "Project A" } });
  assert.equal(settings.get().linear.unlisted, "hide");
  await settings.connectKey({ apiKey: KEY });
  assert.equal(saved().unlisted, "hide");
});

test("disconnect empties the key and keeps the table", () => {
  const { settings, saved } = setup({ apiKey: KEY, teams: { ENG: "Project A" }, unlisted: "hide" });
  const result = settings.disconnect();
  assert.deepEqual(saved(), { apiKey: "", teams: { ENG: "Project A" }, unlisted: "hide" });
  assert.deepEqual([result.linear.connected, result.linear.keyTail, result.linear.teams], [false, null, { ENG: "Project A" }]);
});

test("with no file the settings say not connected, with the default rule", () => {
  const { settings } = setup();
  assert.deepEqual(settings.get().linear, { connected: false, keyTail: null, legacy: false, teams: {}, unlisted: "show" });
});

test("the key tail is four characters at most", () => {
  const { settings } = setup({ apiKey: "ab" });
  assert.equal(settings.get().linear.keyTail, "ab");
});

test("a legacy file reads as legacy and converts on the first save", async () => {
  const legacy = { workspaces: [{ name: "A", apiKey: "key-a-1111", teams: { ENG: "Project A" } }, { name: "B", apiKey: "" }] };
  const { settings, saved } = setup(legacy);
  assert.deepEqual(settings.get().linear, { connected: true, keyTail: "1111", legacy: true, teams: { ENG: "Project A" }, unlisted: "hide" });
  settings.saveTeams({ teams: { ENG: null }, unlisted: "show" });
  assert.deepEqual(saved(), { apiKey: "key-a-1111", teams: { ENG: null }, unlisted: "show" });
  assert.equal(settings.get().linear.legacy, false);
});

test("a legacy file with several keys is never rewritten from the UI", async () => {
  const legacy = { workspaces: [{ name: "A", apiKey: "key-a-1111" }, { name: "B", apiKey: "key-b-2222" }] };
  const { settings, saved } = setup(legacy);
  assert.throws(() => settings.saveTeams({ teams: {}, unlisted: "show" }), /several keys/);
  assert.throws(() => settings.disconnect(), /several keys/);
  await assert.rejects(settings.connectKey({ apiKey: "key-new-3333" }), /several keys/);
  assert.deepEqual(saved(), legacy);
});

test("saveTeams replaces the whole table and keeps the key", () => {
  const { settings, saved, calls } = setup({ apiKey: KEY, teams: { ENG: "A", OPS: "B" }, unlisted: "hide" });
  settings.saveTeams({ teams: { ENG: "", DES: null }, unlisted: "show" });
  assert.deepEqual(saved(), { apiKey: KEY, teams: { ENG: "", DES: null }, unlisted: "show" });
  assert.deepEqual(calls, ["invalidate"]);
});

test("teams lists the Linear teams, and needs a key", async () => {
  assert.deepEqual(await setup({ apiKey: KEY }).settings.teams(), { teams: [{ key: "ENG", name: "Engineering" }] });
  await assert.rejects(setup().settings.teams(), (error: Error & { status?: number }) => error.status === 409 && error.message === "Linear is not connected");
});

test("rememberTeam adds the project for a team and keeps the rest", () => {
  const { settings, saved } = setup({ apiKey: KEY, teams: { OPS: null }, unlisted: "show" });
  settings.rememberTeam("ENG", "Project A");
  assert.deepEqual(saved(), { apiKey: KEY, teams: { OPS: null, ENG: "Project A" }, unlisted: "show" });
});

test("rememberTeam converts a legacy file with one key, and leaves one with several keys alone", () => {
  const one = setup({ workspaces: [{ name: "A", apiKey: "key-a-1111" }] });
  one.settings.rememberTeam("ENG", "Project A");
  assert.deepEqual(one.saved(), { apiKey: "key-a-1111", teams: { ENG: "Project A" }, unlisted: "show" });
  const many = setup({ workspaces: [{ name: "A", apiKey: "key-a" }, { name: "B", apiKey: "key-b" }] });
  many.settings.rememberTeam("ENG", "Project A");
  assert.ok("workspaces" in many.saved());
});

test("parseTeamsBody accepts titles, empty strings and null, and refuses other shapes", () => {
  assert.deepEqual(parseTeamsBody({ teams: { A: "x", B: "", C: null }, unlisted: "hide" }), { teams: { A: "x", B: "", C: null }, unlisted: "hide" });
  for (const bad of [{}, { teams: [], unlisted: "show" }, { teams: { A: 1 }, unlisted: "show" }, { teams: {}, unlisted: "x" }, { teams: { "": "x" }, unlisted: "show" }]) {
    assert.throws(() => parseTeamsBody(bad), (error: Error & { status?: number }) => error.status === 400);
  }
});
