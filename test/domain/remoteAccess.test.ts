import assert from "node:assert/strict";
import { test } from "bun:test";
import { createRemoteAccess, installCommand, loginCommand, remoteUrl } from "../../src/domain/remoteAccess.ts";
import type { TailscaleResult, TailscaleRun } from "../../src/integrations/tailscale/cli.ts";
import type { ServeStatus } from "../../src/integrations/tailscale/schemas.ts";

const NAME = "box.tail.ts.net";
const served = (servePort: number, proxy: string, host = NAME): ServeStatus => ({
  TCP: { [String(servePort)]: { HTTPS: true } },
  Web: { [`${host}:${servePort}`]: { Handlers: { "/": { Proxy: proxy } } } },
});

test("remoteUrl builds the address from a matching serve entry", () => {
  assert.equal(remoteUrl(served(4300, "http://127.0.0.1:4300"), NAME, 4300), `https://${NAME}:4300`);
  assert.equal(remoteUrl(served(443, "http://localhost:4300/"), NAME, 4300), `https://${NAME}`);
  assert.equal(remoteUrl(served(8443, "http://127.0.0.1:4300"), NAME, 4300), `https://${NAME}:8443`);
  assert.equal(remoteUrl(served(4300, "http://127.0.0.1:4300", "BOX.tail.ts.net"), NAME, 4300), `https://${NAME}:4300`);
});

test("remoteUrl refuses entries that do not match", () => {
  const no = (serve: ServeStatus) => assert.equal(remoteUrl(serve, NAME, 4300), null);
  no({});
  no(served(4300, "http://127.0.0.1:4301"));
  no(served(4300, "https://127.0.0.1:4300"));
  no(served(4300, "http://example.com:4300"));
  no(served(4300, "http://127.0.0.1:4300/api"));
  no(served(4300, "not a url"));
  no(served(4300, "http://127.0.0.1:4300", "other.tail.ts.net"));
  no(served(4300, "http://127.0.0.1:4300", "svc:dashboard"));
  no({ TCP: { "4300": { HTTPS: false } }, Web: served(4300, "http://127.0.0.1:4300").Web });
  no({ Web: served(4300, "http://127.0.0.1:4300").Web });
});

test("remoteUrl prefers 443, then the lowest port", () => {
  const web = { ...served(8443, "http://127.0.0.1:4300").Web, ...served(443, "http://127.0.0.1:4300").Web, ...served(4300, "http://127.0.0.1:4300").Web };
  const tcp = { "8443": { HTTPS: true }, "443": { HTTPS: true }, "4300": { HTTPS: true } };
  assert.equal(remoteUrl({ TCP: tcp, Web: web }, NAME, 4300), `https://${NAME}`);
  const { [`${NAME}:443`]: _, ...rest } = web;
  assert.equal(remoteUrl({ TCP: tcp, Web: rest }, NAME, 4300), `https://${NAME}:4300`);
});

interface Fake {
  run: TailscaleRun;
  calls: string[][];
  self: Partial<TailscaleResult>;
  serve: Partial<TailscaleResult>;
  serveCommand: (args: string[]) => Partial<TailscaleResult>;
}

/** A recording runner: `serve --bg` stores the entry, as Tailscale does. */
function fake(): Fake {
  const state: Fake = {
    calls: [],
    self: { stdout: JSON.stringify({ BackendState: "Running", Self: { DNSName: `${NAME}.` } }) },
    serve: { stdout: "{}" },
    serveCommand: () => ({ code: 0 }),
    run: async (args) => {
      state.calls.push(args);
      const base = { code: 0, stdout: "", stderr: "" };
      if (args[0] === "status") return { ...base, ...state.self };
      if (args[1] === "status") return { ...base, ...state.serve };
      await Promise.resolve();
      const result = state.serveCommand(args);
      if (result.code === 0 || result.code === undefined) state.serve = { stdout: JSON.stringify(served(Number(args[2]!.slice(8)), args[3]!)) };
      return { ...base, ...result };
    },
  };
  return state;
}

const make = (ts: Fake, now = () => 0, platform: NodeJS.Platform = "linux") => createRemoteAccess({ port: 4300, platform, run: (args, options) => ts.run(args, options), now });
const serveCalls = (ts: Fake) => ts.calls.filter((args) => args[0] === "serve" && args[1] !== "status");

test("status maps Tailscale states", async () => {
  const ts = fake();
  ts.self = { code: null, missing: true };
  assert.deepEqual(await make(ts).status(), { state: "not-installed", installCommand: "curl -fsSL https://tailscale.com/install.sh | sh" });
  assert.deepEqual(await make(ts, () => 0, "darwin").status(), { state: "not-installed", installCommand: null });
  ts.self = { stdout: JSON.stringify({ BackendState: "Stopped" }) };
  assert.deepEqual(await make(ts).status(), { state: "stopped" });
  ts.self = { code: 1 };
  assert.deepEqual(await make(ts).status(), { state: "stopped" });
  ts.self = { stdout: JSON.stringify({ BackendState: "Running", Self: { DNSName: "" } }) };
  const off = await make(ts).status();
  assert.equal(off.state, "error");
  assert.match((off as { message: string }).message, /MagicDNS is off/);
  ts.self = { stdout: "garbage" };
  assert.equal((await make(ts).status()).state, "error");
});

test("status is needs-enable with the command, then ready once served", async () => {
  const ts = fake();
  const access = make(ts);
  assert.deepEqual(await access.status(), { state: "needs-enable", command: "tailscale serve --bg --https=4300 http://127.0.0.1:4300", error: null, approveUrl: null });
  ts.serve = { stdout: JSON.stringify(served(4300, "http://127.0.0.1:4300")) };
  assert.deepEqual(await access.status(), { state: "ready", url: `https://${NAME}:4300` });
  assert.equal(access.host(), NAME);
});

test("status treats an unreadable serve list as nothing served", async () => {
  const ts = fake();
  ts.serve = { code: 1 };
  assert.equal((await make(ts).status()).state, "needs-enable");
});

test("enable runs the serve command once, then answers ready", async () => {
  const ts = fake();
  assert.deepEqual(await make(ts).enable(), { state: "ready", url: `https://${NAME}:4300` });
  assert.deepEqual(serveCalls(ts), [["serve", "--bg", "--https=4300", "http://127.0.0.1:4300"]]);
});

test("enable does nothing when ready, stopped or not installed", async () => {
  const ts = fake();
  ts.serve = { stdout: JSON.stringify(served(4300, "http://127.0.0.1:4300")) };
  assert.equal((await make(ts).enable()).state, "ready");
  ts.self = { stdout: JSON.stringify({ BackendState: "Stopped" }) };
  assert.equal((await make(ts).enable()).state, "stopped");
  ts.self = { stdout: JSON.stringify({ BackendState: "NeedsLogin" }) };
  assert.equal((await make(ts).enable()).state, "needs-login");
  ts.self = { code: null, missing: true };
  assert.equal((await make(ts).enable()).state, "not-installed");
  assert.deepEqual(serveCalls(ts), []);
});

test("enable never serves over a port that Tailscale already uses", async () => {
  const ts = fake();
  ts.serve = { stdout: JSON.stringify({ TCP: { "4300": { HTTPS: true } }, Web: served(4300, "http://127.0.0.1:9999").Web }) };
  assert.deepEqual(await make(ts).enable(), {
    state: "needs-enable",
    command: "tailscale serve --bg --https=4300 http://127.0.0.1:4300",
    error: "Tailscale already uses port 4300 for something else. Change it by hand.",
    approveUrl: null,
  });
  assert.deepEqual(serveCalls(ts), []);
});

test("enable never serves when Tailscale does not list its Serve entries", async () => {
  const ts = fake();
  ts.serve = { code: 1, stderr: "Access denied" };
  const result = await make(ts).enable();
  assert.equal(result.state, "needs-enable");
  assert.match((result as { error: string }).error, /^Tailscale did not list its Serve entries/);
  assert.deepEqual(serveCalls(ts), []);
});

test("the allowed host is cleared once Tailscale stops", async () => {
  const ts = fake();
  const access = make(ts);
  await access.status();
  assert.equal(access.host(), NAME);
  ts.self = { stdout: JSON.stringify({ BackendState: "Stopped" }) };
  assert.equal((await access.status()).state, "stopped");
  assert.equal(access.host(), null);
});

test("enable turns a failure into a sentence, and keeps the approve link", async () => {
  const ts = fake();
  ts.serveCommand = () => ({ code: 1, stderr: "Access denied" });
  const denied = await make(ts).enable();
  assert.equal(denied.state, "needs-enable");
  assert.match((denied as { error: string }).error, /^Tailscale refused: only root or the Tailscale operator/);
  ts.serveCommand = () => ({ code: null, stdout: "visit https://login.tailscale.com/f/serve?node=n1\n" });
  assert.deepEqual(await make(ts).enable(), {
    state: "needs-enable",
    command: "tailscale serve --bg --https=4300 http://127.0.0.1:4300",
    error: "Serve is off on this tailnet. Open the link, approve it, then press Enable again.",
    approveUrl: "https://login.tailscale.com/f/serve?node=n1",
  });
  ts.serveCommand = () => ({ code: 1, stderr: "HTTPS certificates are disabled" });
  assert.match(((await make(ts).enable()) as { error: string }).error, /^HTTPS certificates are off/);
  ts.serveCommand = () => ({ code: null });
  assert.match(((await make(ts).enable()) as { error: string }).error, /^Tailscale did not answer in time/);
  ts.serveCommand = () => ({ code: 1, stderr: "boom" });
  assert.match(((await make(ts).enable()) as { error: string }).error, /^Tailscale could not share/);
});

test("enable reports a command that worked but left no entry", async () => {
  const ts = fake();
  ts.run = ((inner) => async (args, options) => {
    const result = await inner(args, options);
    return args[1] === "status" ? { ...result, stdout: "{}" } : result;
  })(ts.run);
  const result = await make(ts).enable();
  assert.equal(result.state, "needs-enable");
  assert.match((result as { error: string }).error, /^Tailscale accepted the command/);
});

test("two parallel enable calls run one serve command", async () => {
  const ts = fake();
  const access = make(ts);
  const [a, b] = await Promise.all([access.enable(), access.enable()]);
  assert.equal(a.state, "ready");
  assert.deepEqual(a, b);
  assert.equal(serveCalls(ts).length, 1);
});

test("refreshHost reads the name at most once per 30 seconds and never throws", async () => {
  const ts = fake();
  let time = 1_000_000;
  const access = make(ts, () => time);
  assert.equal(access.host(), null);
  await access.refreshHost();
  assert.equal(access.host(), NAME);
  await access.refreshHost();
  assert.equal(ts.calls.length, 1);
  time += 30_001;
  ts.self = { stdout: JSON.stringify({ BackendState: "Running", Self: { DNSName: "new.tail.ts.net." } }) };
  await access.refreshHost();
  assert.equal(access.host(), "new.tail.ts.net");
  time += 30_001;
  ts.self = { stdout: "garbage" };
  await access.refreshHost();
  assert.equal(access.host(), "new.tail.ts.net");
  time += 30_001;
  ts.run = async () => { throw new Error("boom"); };
  await access.refreshHost();
});

test("parallel refreshHost calls share one read", async () => {
  const ts = fake();
  const access = make(ts);
  await Promise.all([access.refreshHost(), access.refreshHost()]);
  assert.equal(ts.calls.length, 1);
});

test("installCommand and loginCommand depend on the platform", () => {
  assert.equal(installCommand("linux"), "curl -fsSL https://tailscale.com/install.sh | sh");
  assert.equal(installCommand("win32"), "winget install --id tailscale.tailscale");
  assert.equal(installCommand("darwin"), null);
  assert.equal(loginCommand("linux"), "sudo tailscale up --operator=$USER");
  assert.equal(loginCommand("darwin"), "tailscale up");
  assert.equal(loginCommand("win32"), "tailscale up");
});

const needsLogin = (authUrl?: string) => ({ stdout: JSON.stringify({ BackendState: "NeedsLogin", ...(authUrl ? { AuthURL: authUrl } : {}) }) });

test("status is needs-login with the sign-in link Tailscale gave, and no allowed host", async () => {
  const ts = fake();
  const access = make(ts);
  await access.status();
  assert.equal(access.host(), NAME);
  ts.self = needsLogin("https://login.tailscale.com/a/x");
  assert.deepEqual(await access.status(), { state: "needs-login", loginUrl: "https://login.tailscale.com/a/x", error: null, command: "sudo tailscale up --operator=$USER" });
  assert.equal(access.host(), null);
  ts.self = needsLogin();
  assert.equal(((await make(ts, () => 0, "win32").status()) as { command: string }).command, "tailscale up");
});

test("login runs tailscale login once and gives the sign-in link", async () => {
  const ts = fake();
  ts.self = needsLogin();
  const base = ts.run;
  ts.run = async (args, options) => (args[0] === "login" ? (ts.calls.push(args), { code: null, stdout: "", stderr: "visit https://login.tailscale.com/a/new\n" }) : base(args, options));
  const access = make(ts);
  const [a, b] = await Promise.all([access.login(), access.login()]);
  assert.deepEqual(a, { state: "needs-login", loginUrl: "https://login.tailscale.com/a/new", error: null, command: "sudo tailscale up --operator=$USER" });
  assert.deepEqual(a, b);
  assert.equal(ts.calls.filter((args) => args[0] === "login").length, 1);
});

test("login does nothing when the machine is not waiting for a sign-in", async () => {
  const ts = fake();
  assert.equal((await make(ts).login()).state, "needs-enable");
  assert.deepEqual(ts.calls.filter((args) => args[0] === "login"), []);
});

test("login turns a failure into a sentence", async () => {
  const ts = fake();
  ts.self = needsLogin();
  const base = ts.run;
  let outcome: Partial<TailscaleResult> = {};
  ts.run = async (args, options) => (args[0] === "login" ? { code: 1, stdout: "", stderr: "", ...outcome } : base(args, options));
  const error = async () => ((await make(ts).login()) as { error: string }).error;
  outcome = { stderr: "Access denied" };
  assert.match(await error(), /^Tailscale refused: only root or the Tailscale operator can sign in/);
  outcome = { code: null };
  assert.match(await error(), /^Tailscale did not give a sign-in link in time/);
  outcome = { stderr: "boom" };
  assert.match(await error(), /^Tailscale could not start the sign-in/);
});

test("login reads the status again when tailscale login ends with exit 0 and no link", async () => {
  const ts = fake();
  ts.self = needsLogin();
  const base = ts.run;
  ts.run = async (args, options) => {
    if (args[0] !== "login") return base(args, options);
    ts.self = { stdout: JSON.stringify({ BackendState: "Running", Self: { DNSName: `${NAME}.` } }) };
    return { code: 0, stdout: "Success.", stderr: "" };
  };
  assert.equal((await make(ts).login()).state, "needs-enable");
});
