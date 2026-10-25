import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { ISSUE_COMMAND, INSTALL_URL, TokenManager, locateT3, runCommand } from "../src/auth.ts";
import type { RunResult, Validation } from "../src/auth.ts";
import { writeSecret } from "../src/secretFile.ts";

const SECRET = "secret-token-value";
const ENV_FILE = "/cfg/env-token.json";
const AUTH = "/cfg/t3-dashboard/auth.json";

interface Options {
  env?: Record<string, string | undefined>;
  files?: Record<string, string>;
  t3?: string | null;
  run?: (cmd: string, args: string[]) => RunResult;
  validate?: (token: string) => Validation;
}

function setup(options: Options = {}) {
  const files: Record<string, string> = { ...options.files };
  const logs: string[] = [];
  const runs: Array<{ cmd: string; args: string[] }> = [];
  const validated: string[] = [];
  const manager = new TokenManager({
    env: { T3_DASHBOARD_CONFIG_DIR: "/cfg/t3-dashboard", ...options.env },
    homedir: "/home/ann",
    readFile: (path) => {
      if (path in files) return files[path]!;
      throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" });
    },
    writeSecret: (path, text) => {
      files[path] = text;
    },
    findT3: () => (options.t3 === undefined ? "/bin/t3" : options.t3),
    run: async (cmd, args) => {
      runs.push({ cmd, args });
      return options.run ? options.run(cmd, args) : { code: 0, stdout: `${SECRET}\n` };
    },
    validate: async (token) => {
      validated.push(token);
      return options.validate ? options.validate(token) : "ok";
    },
    log: (message) => logs.push(message),
    now: () => new Date("2026-03-20T12:00:00.000Z"),
  });
  return { manager, files, logs, runs, validated };
}

const stored = (token: string, source = "issued") => JSON.stringify({ token, source, createdAt: "2026-01-01T00:00:00.000Z" });

test("with a token file variable, that file is used and nothing is issued", async () => {
  const { manager, runs } = setup({ env: { T3_DASHBOARD_TOKEN_FILE: ENV_FILE }, files: { [ENV_FILE]: '{"token":"from-env"}', [AUTH]: stored("from-store") } });
  await manager.refresh();
  assert.equal(manager.current(), "from-env");
  assert.equal(manager.source(), "env-file");
  assert.equal(manager.setup(), null);
  assert.equal(runs.length, 0);
});

test("a rejected or unreadable token file needs a token and never issues one", async () => {
  for (const files of [{ [ENV_FILE]: '{"token":"bad"}' }, {} as Record<string, string>]) {
    const { manager, runs } = setup({ env: { T3_DASHBOARD_TOKEN_FILE: ENV_FILE }, files, validate: () => "rejected" });
    await manager.refresh();
    assert.equal(manager.current(), null);
    assert.equal(manager.setup()?.reason, "token-needed");
    assert.equal(runs.length, 0);
  }
});

test("a stored token is used when T3 accepts it or cannot be reached", async () => {
  for (const verdict of ["ok", "unreachable"] as const) {
    const { manager, runs } = setup({ files: { [AUTH]: stored("from-store", "pasted") }, validate: () => verdict });
    await manager.refresh();
    assert.equal(manager.current(), "from-store");
    assert.equal(manager.source(), "pasted");
    assert.equal(runs.length, 0);
  }
});

test("a rejected stored token is replaced by a new one and the file is overwritten", async () => {
  const { manager, files, logs } = setup({ files: { [AUTH]: stored("old") }, validate: (token) => (token === "old" ? "rejected" : "ok") });
  await manager.refresh();
  assert.equal(manager.current(), SECRET);
  assert.equal(manager.source(), "issued");
  assert.deepEqual(JSON.parse(files[AUTH]!), { token: SECRET, source: "issued", createdAt: "2026-03-20T12:00:00.000Z" });
  assert.deepEqual(logs, [`Created a T3 Code token for the dashboard (stored in ${AUTH})`]);
});

test("with no token, it runs the issue command and stores the result", async () => {
  const { manager, runs, files } = setup();
  await manager.refresh();
  assert.deepEqual(runs, [{ cmd: "/bin/t3", args: ["auth", "session", "issue", "--ttl", "3650d", "--label", "T3 Dashboard", "--token-only"] }]);
  assert.equal(manager.current(), SECRET);
  assert.equal(JSON.parse(files[AUTH]!).token, SECRET);
});

test("T3CODE_HOME is passed as --base-dir", async () => {
  const { manager, runs } = setup({ env: { T3CODE_HOME: "/x/t3home" } });
  await manager.refresh();
  assert.deepEqual(runs[0]!.args.slice(-2), ["--base-dir", "/x/t3home"]);
});

test("the issue command shown to the user matches the one that runs", () => {
  assert.equal(ISSUE_COMMAND, 't3 auth session issue --ttl 3650d --label "T3 Dashboard" --token-only');
});

test("t3 missing and T3 unreachable asks to install T3 Code", async () => {
  const { manager, runs } = setup({ t3: null, validate: () => "unreachable" });
  await manager.refresh();
  assert.equal(manager.current(), null);
  assert.deepEqual(manager.setup(), { reason: "t3-missing", detail: null, issueCommand: ISSUE_COMMAND, installUrl: INSTALL_URL });
  assert.equal(runs.length, 0);
});

test("a failing command while T3 is unreachable asks to start T3 Code", async () => {
  const { manager } = setup({ run: () => ({ code: 1, stdout: "" }), validate: () => "unreachable" });
  await manager.refresh();
  assert.equal(manager.setup()?.reason, "t3-stopped");
});

test("a failing command while T3 runs asks for a pasted token, with the exit code", async () => {
  const { manager } = setup({ run: () => ({ code: 3, stdout: "" }) });
  await manager.refresh();
  assert.equal(manager.setup()?.reason, "token-needed");
  assert.equal(manager.setup()?.detail, "t3 auth session issue failed (exit 3)");
});

test("t3 missing while T3 runs asks for a pasted token", async () => {
  const { manager } = setup({ t3: null });
  await manager.refresh();
  assert.equal(manager.setup()?.reason, "token-needed");
  assert.equal(manager.setup()?.detail, "t3 command not found");
});

test("output that is not a single token is not stored", async () => {
  for (const stdout of ["", "\n", "one\ntwo\n"]) {
    const { manager, files } = setup({ run: () => ({ code: 0, stdout }) });
    await manager.refresh();
    assert.equal(manager.current(), null);
    assert.equal(manager.setup()?.reason, "token-needed");
    assert.equal(AUTH in files, false);
  }
});

test("an issued token that T3 refuses is not stored", async () => {
  const { manager, files } = setup({ validate: (token) => (token === SECRET ? "rejected" : "ok") });
  await manager.refresh();
  assert.equal(manager.current(), null);
  assert.equal(AUTH in files, false);
});

test("a token never appears in a log line or in the setup info", async () => {
  const cases: Options[] = [{}, { run: () => ({ code: 1, stdout: SECRET }) }, { run: () => ({ code: 0, stdout: `${SECRET}\nmore` }) }, { files: { [AUTH]: stored(SECRET) }, validate: () => "rejected", t3: null }];
  for (const options of cases) {
    const { manager, logs } = setup(options);
    await manager.refresh();
    const seen = JSON.stringify([logs, manager.setup()]);
    assert.ok(!seen.includes(SECRET), seen);
  }
});

test("paste stores a token T3 accepts and the setup disappears", async () => {
  const { manager, files } = setup({ t3: null, validate: (token) => (token === "" ? "unreachable" : "ok") });
  await manager.refresh();
  assert.ok(manager.setup());
  assert.equal(await manager.paste("  pasted-one \n"), "ok");
  assert.equal(manager.current(), "pasted-one");
  assert.equal(manager.source(), "pasted");
  assert.equal(manager.setup(), null);
  assert.equal(JSON.parse(files[AUTH]!).source, "pasted");
});

test("paste is refused while the token file variable is set, and nothing is stored", async () => {
  const { manager, files, validated } = setup({ env: { T3_DASHBOARD_TOKEN_FILE: ENV_FILE }, files: { [ENV_FILE]: '{"token":"from-env"}' } });
  await manager.refresh();
  assert.equal(await manager.paste("pasted-one"), "locked");
  assert.equal(manager.current(), "from-env");
  assert.equal(AUTH in files, false);
  assert.deepEqual(validated, ["from-env"]);
});

test("paste reports a refused or unreachable T3 and stores nothing", async () => {
  for (const verdict of ["rejected", "unreachable"] as const) {
    const { manager, files } = setup({ validate: () => verdict, run: () => ({ code: 1, stdout: "" }) });
    await manager.refresh();
    assert.equal(await manager.paste("nope"), verdict);
    assert.equal(manager.current(), null);
    assert.equal(AUTH in files, false);
  }
});

test("overlapping refreshes run one resolution", async () => {
  const { manager, runs } = setup();
  await Promise.all([manager.refresh(), manager.refresh()]);
  assert.equal(runs.length, 1);
});

test("a stored token that cannot be written is still used for this run", async () => {
  const manager = new TokenManager({
    env: { T3_DASHBOARD_CONFIG_DIR: "/cfg" },
    homedir: "/h",
    readFile: () => {
      throw new Error("ENOENT");
    },
    writeSecret: () => {
      throw new Error(`EACCES ${SECRET}`);
    },
    findT3: () => "/bin/t3",
    run: async () => ({ code: 0, stdout: SECRET }),
    validate: async () => "ok",
    log: (message) => assert.ok(!message.includes(SECRET)),
  });
  await manager.refresh();
  assert.equal(manager.current(), SECRET);
});

test("the stored file is private (0600)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "auth-test-"));
  const file = join(dir, "nested", "auth.json");
  writeSecret(file, "{}");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(join(dir, "nested")).mode & 0o777, 0o700);
  assert.equal(readFileSync(file, "utf8"), "{}");
});

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
