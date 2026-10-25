import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "bun:test";
import { ISSUE_COMMAND, issueToken, locateT3, runCommand } from "../../../src/integrations/t3/cli.ts";

test("locateT3 prefers the variable, then PATH, then the usual folders", () => {
  const exists = (known: string[]) => (path: string) => known.includes(path);
  const none = () => null;
  assert.equal(locateT3({ T3_DASHBOARD_T3_BIN: "/opt/t3" }, "/h", exists(["/opt/t3", "/h/.local/bin/t3"]), () => "/p/t3"), "/opt/t3");
  assert.equal(locateT3({}, "/h", exists([]), () => "/p/t3"), "/p/t3");
  assert.equal(locateT3({}, "/h", exists(["/usr/local/bin/t3", "/opt/homebrew/bin/t3"]), none), "/opt/homebrew/bin/t3");
  assert.equal(locateT3({}, "/h", exists(["/h/.local/bin/t3"]), none), "/h/.local/bin/t3");
  assert.equal(locateT3({ T3_DASHBOARD_T3_BIN: "/nonexistent" }, "/h", exists([]), none), null);
  assert.equal(locateT3({ LOCALAPPDATA: "C:\\L" }, "/h", exists([join("C:\\L", "Programs", "t3", "t3.exe")]), none), join("C:\\L", "Programs", "t3", "t3.exe"));
});

test("runCommand returns the exit code and stdout, and a null code on a timeout or a missing program", async () => {
  assert.deepEqual(await runCommand(process.execPath, ["-e", "console.log('hi')"], { timeoutMs: 10_000 }), { code: 0, stdout: "hi\n" });
  assert.equal((await runCommand(process.execPath, ["-e", "process.exit(4)"], { timeoutMs: 10_000 })).code, 4);
  assert.equal((await runCommand(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { timeoutMs: 200 })).code, null);
  assert.equal((await runCommand("/nonexistent/t3", [], { timeoutMs: 1000 })).code, null);
});

test("locateT3 prefers the CLI of the running server version over an older one on PATH", () => {
  const exists = (paths: string[]) => (p: string) => paths.includes(p);
  const runtime = "/h/.t3/runtime/versions/0.2.0/t3";
  assert.equal(locateT3({}, "/h", exists([runtime]), () => "/h/.local/bin/t3", "0.2.0"), runtime);
  assert.equal(locateT3({ T3CODE_HOME: "/data/t3" }, "/h", exists(["/data/t3/runtime/versions/0.2.0/t3"]), () => null, "0.2.0"), "/data/t3/runtime/versions/0.2.0/t3");
  assert.equal(locateT3({}, "/h", exists([]), () => "/p/t3", "0.2.0"), "/p/t3");
  assert.equal(locateT3({}, "/h", exists([runtime]), () => "/p/t3", "../evil"), "/p/t3");
});

test("the issue command shown to the user matches the one that runs", () => {
  assert.equal(ISSUE_COMMAND, 't3 auth session issue --ttl 3650d --label "T3 Dashboard" --token-only');
});

test("issueToken runs the issue command and keeps a single line of output as the token", async () => {
  const calls: Array<{ t3: string; args: string[]; timeoutMs: number }> = [];
  const run = (code: number | null, stdout: string) => async (t3: string, args: string[], { timeoutMs }: { timeoutMs: number }) => {
    calls.push({ t3, args, timeoutMs });
    return { code, stdout };
  };
  assert.deepEqual(await issueToken(run(0, " tok-1 \n\n"), "/bin/t3", {}), { code: 0, token: "tok-1" });
  assert.equal(`t3 ${calls[0]!.args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`, ISSUE_COMMAND);
  assert.equal(calls[0]!.timeoutMs, 20_000);
  assert.deepEqual(await issueToken(run(0, "a\nb\n"), "/bin/t3", {}), { code: 0, token: null });
  assert.deepEqual(await issueToken(run(3, "tok\n"), "/bin/t3", {}), { code: 3, token: null });
  assert.deepEqual(await issueToken(run(null, ""), "/bin/t3", {}), { code: null, token: null });
  await issueToken(run(0, "tok\n"), "/bin/t3", { T3CODE_HOME: "/x/t3home" });
  assert.deepEqual(calls.at(-1)!.args.slice(-2), ["--base-dir", "/x/t3home"]);
});
