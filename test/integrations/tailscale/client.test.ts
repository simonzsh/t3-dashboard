import assert from "node:assert/strict";
import { test } from "bun:test";
import { IntegrationError } from "../../../src/integrations/errors.ts";
import type { TailscaleResult, TailscaleRun } from "../../../src/integrations/tailscale/cli.ts";
import { enableServe, readSelf, readServe, serveArgs, serveCommand } from "../../../src/integrations/tailscale/client.ts";

const answer = (result: Partial<TailscaleResult>): TailscaleRun => async () => ({ code: 0, stdout: "", stderr: "", ...result });
const status = (value: unknown) => answer({ stdout: JSON.stringify(value) });

test("readSelf tells a missing program, a stopped Tailscale and a running one", async () => {
  assert.deepEqual(await readSelf(answer({ code: null, missing: true })), { kind: "missing" });
  assert.deepEqual(await readSelf(answer({ code: 1 })), { kind: "down" });
  assert.deepEqual(await readSelf(status({ BackendState: "NeedsLogin" })), { kind: "down" });
  assert.deepEqual(await readSelf(status({ BackendState: "Running", Self: { DNSName: "Box.Tail.ts.net." } })), { kind: "running", dnsName: "box.tail.ts.net" });
  assert.deepEqual(await readSelf(status({ BackendState: "Running", Self: { DNSName: "" } })), { kind: "running", dnsName: null });
  assert.deepEqual(await readSelf(status({ BackendState: "Running", Self: null })), { kind: "running", dnsName: null });
});

test("readSelf runs status --json and throws a protocol error for an unreadable answer", async () => {
  const calls: string[][] = [];
  await readSelf(async (args) => (calls.push(args), { code: 0, stdout: '{"BackendState":"Stopped"}', stderr: "" }));
  assert.deepEqual(calls, [["status", "--json"]]);
  for (const stdout of ["not json", '{"BackendState":3}']) {
    const error = await readSelf(answer({ stdout })).catch((caught) => caught);
    assert.ok(error instanceof IntegrationError);
    assert.equal(error.system, "tailscale");
    assert.equal(error.kind, "protocol");
  }
});

test("readServe reads the serve list, and gives null when Tailscale refuses or is slow", async () => {
  assert.equal(await readServe(answer({ code: 1 })), null);
  assert.equal(await readServe(answer({ code: null })), null);
  assert.deepEqual(await readServe(answer({ stdout: "  \n" })), {});
  assert.deepEqual(await readServe(answer({ stdout: "{}" })), {});
  const serve = { TCP: { "4300": { HTTPS: true } }, Web: { "box.tail.ts.net:4300": { Handlers: { "/": { Proxy: "http://127.0.0.1:4300" } } } } };
  assert.deepEqual(await readServe(status(serve)), serve);
  const error = await readServe(answer({ stdout: '{"TCP":3}' })).catch((caught) => caught);
  assert.ok(error instanceof IntegrationError && error.kind === "protocol");
});

test("serveArgs and serveCommand build the same command", () => {
  assert.deepEqual(serveArgs(4300), ["serve", "--bg", "--https=4300", "http://127.0.0.1:4300"]);
  assert.equal(serveCommand(4300), "tailscale serve --bg --https=4300 http://127.0.0.1:4300");
});

test("enableServe runs the serve command and succeeds on exit 0", async () => {
  const calls: Array<{ args: string[]; timeoutMs: number }> = [];
  const result = await enableServe(async (args, { timeoutMs }) => (calls.push({ args, timeoutMs }), { code: 0, stdout: "", stderr: "" }), 4300);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{ args: serveArgs(4300), timeoutMs: 15_000 }]);
});

test("enableServe names the cause of a failure", async () => {
  const fail = (result: Partial<TailscaleResult>) => enableServe(answer({ code: 1, ...result }), 4300);
  assert.deepEqual(await fail({ stderr: "Access denied: serve config denied\nUse 'sudo tailscale ...'" }), { ok: false, reason: "denied", approveUrl: null });
  assert.deepEqual(await fail({ stderr: "must be root" }), { ok: false, reason: "denied", approveUrl: null });
  assert.deepEqual(await fail({ stderr: "HTTPS cert support is not enabled" }), { ok: false, reason: "https-off", approveUrl: null });
  assert.deepEqual(await fail({ stderr: "something odd" }), { ok: false, reason: "failed", approveUrl: null });
  assert.deepEqual(await fail({ code: null }), { ok: false, reason: "timeout", approveUrl: null });
});

test("enableServe returns the approve link, even when the command timed out", async () => {
  const stdout = "\nServe is not enabled on your tailnet.\nTo enable, visit:\n\n\t  https://login.tailscale.com/f/serve?node=abc123\n";
  const expected = { ok: false, reason: "needs-approval", approveUrl: "https://login.tailscale.com/f/serve?node=abc123" };
  assert.deepEqual(await enableServe(answer({ code: null, stdout }), 4300), expected);
  assert.deepEqual(await enableServe(answer({ code: 1, stderr: stdout }), 4300), expected);
});
