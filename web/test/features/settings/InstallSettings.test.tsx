import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RemoteAccess } from "../../../../shared/api.ts";
import { RemoteAccessView } from "../../../src/features/settings/InstallSettings.tsx";

const base = { access: null, loadError: false, checking: false, enabling: false, signingIn: false, onEnable() {}, onSignIn() {}, onCheck() {} };
const render = (over: Partial<Parameters<typeof RemoteAccessView>[0]>) => renderToStaticMarkup(<RemoteAccessView {...base} {...over} />);
const COMMAND = "tailscale serve --bg --https=4300 http://127.0.0.1:4300";
const needs = (over: Partial<Extract<RemoteAccess, { state: "needs-enable" }>> = {}): RemoteAccess => ({ state: "needs-enable", command: COMMAND, error: null, approveUrl: null, ...over });

test("loading shows the inline loader", () => {
  assert.match(render({}), /Checking Tailscale/);
});

test("a load error offers Check again", () => {
  const html = render({ loadError: true });
  assert.match(html, /could not be loaded/);
  assert.match(html, /Check again/);
});

test("not-installed without a command links the download and lists the steps", () => {
  const html = render({ access: { state: "not-installed", installCommand: null } });
  assert.match(html, /href="https:\/\/tailscale\.com\/download"/);
  assert.match(html, /Sign in to the same tailnet/);
  assert.match(html, /Check again/);
  assert.doesNotMatch(html, /install-command/);
});

test("not-installed with a command shows it with a copy button", () => {
  const cmd = "curl -fsSL https://tailscale.com/install.sh | sh";
  const html = render({ access: { state: "not-installed", installCommand: cmd } });
  assert.ok(html.includes("curl -fsSL https://tailscale.com/install.sh | sh"));
  assert.match(html, /Copy the command/);
  assert.match(html, /Install the Tailscale app on your phone/);
});

const login = (over: Partial<Extract<RemoteAccess, { state: "needs-login" }>> = {}): RemoteAccess => ({ state: "needs-login", loginUrl: null, error: null, command: "tailscale up", ...over });

test("needs-login without a link offers Sign in and Check again", () => {
  const html = render({ access: login() });
  assert.match(html, /not signed in/);
  assert.match(html, />Sign in</);
  assert.match(html, /Check again/);
  assert.doesNotMatch(html, /install-qr|install-command|install-error/);
});

test("needs-login with a link shows the page link and its QR code", () => {
  const html = render({ access: login({ loginUrl: "https://login.tailscale.com/a/abc" }) });
  assert.match(html, /href="https:\/\/login\.tailscale\.com\/a\/abc"[^>]*>Open the sign-in page/);
  assert.match(html, /<svg class="install-qr"/);
  assert.match(html, /scan it to sign in from your phone/);
});

test("needs-login with an error shows the error, the command and copy", () => {
  const html = render({ access: login({ error: "Tailscale did not give a sign-in link in time.", command: "sudo tailscale up --operator=$USER" }) });
  assert.match(html, /install-error">Tailscale did not give/);
  assert.ok(html.includes("sudo tailscale up --operator=$USER"));
  assert.match(html, /Copy the command/);
});

test("signing in disables the button and says so", () => {
  const html = render({ access: login(), signingIn: true });
  assert.match(html, /Signing in…/);
  assert.match(html, /disabled/);
});

test("stopped asks to sign in, without the install step", () => {
  const html = render({ access: { state: "stopped" } });
  assert.match(html, /installed but not running\./);
  assert.doesNotMatch(html, /tailscale\.com\/download/);
});

test("needs-enable shows Enable, no command before a try", () => {
  const html = render({ access: needs() });
  assert.match(html, />Enable</);
  assert.doesNotMatch(html, /install-command/);
});

test("enabling disables the button and says so", () => {
  const html = render({ access: needs(), enabling: true });
  assert.match(html, /Enabling…/);
  assert.match(html, /disabled/);
});

test("a failed enable shows the error, the approve link and the command", () => {
  const html = render({ access: needs({ error: "Serve is off on this tailnet.", approveUrl: "https://login.tailscale.com/f/serve/abc" }) });
  assert.match(html, /install-error">Serve is off/);
  assert.match(html, /href="https:\/\/login\.tailscale\.com\/f\/serve\/abc"/);
  assert.ok(html.includes(COMMAND));
  assert.match(html, /Copy the command/);
  assert.match(html, /Enable again/);
  assert.match(html, /Check again/);
});

test("error shows its message", () => {
  assert.match(render({ access: { state: "error", message: "MagicDNS is off." } }), /install-error">MagicDNS is off\./);
});

test("ready shows the QR code and the link", () => {
  const html = render({ access: { state: "ready", url: "https://box.tail.ts.net:4300" } });
  assert.match(html, /<svg class="install-qr"/);
  assert.match(html, /href="https:\/\/box\.tail\.ts\.net:4300"/);
  assert.match(html, /Copy the link/);
  assert.match(html, /Add to Home screen/);
});
