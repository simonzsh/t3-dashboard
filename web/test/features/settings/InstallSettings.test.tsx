import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RemoteAccess } from "../../../../shared/api.ts";
import { RemoteAccessView } from "../../../src/features/settings/InstallSettings.tsx";

const base = { access: null, loadError: false, checking: false, enabling: false, onEnable() {}, onCheck() {} };
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

test("not-installed links the download and lists the steps", () => {
  const html = render({ access: { state: "not-installed" } });
  assert.match(html, /href="https:\/\/tailscale\.com\/download"/);
  assert.match(html, /Sign in to the same tailnet/);
  assert.match(html, /Check again/);
});

test("stopped asks to sign in, without the install step", () => {
  const html = render({ access: { state: "stopped" } });
  assert.match(html, /not running or not signed in/);
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
