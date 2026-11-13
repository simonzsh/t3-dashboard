import type { RemoteAccess } from "../../shared/api.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { TailscaleRun } from "../integrations/tailscale/cli.ts";
import { enableServe, readSelf, readServe, serveCommand, startLogin, type ServeFailure } from "../integrations/tailscale/client.ts";
import type { ServeStatus } from "../integrations/tailscale/schemas.ts";

export interface RemoteAccessOptions {
  /** The port this dashboard listens on. */
  port: number;
  platform: NodeJS.Platform;
  run: TailscaleRun;
  now(): number;
}

export interface RemoteAccessService {
  status(): Promise<RemoteAccess>;
  enable(): Promise<RemoteAccess>;
  /** Starts the sign-in and gives the link to open; does nothing unless the machine waits for a sign-in. */
  login(): Promise<RemoteAccess>;
  /** This machine's MagicDNS name, lowercase, from the last read; null before. */
  host(): string | null;
  /** Reads the name again. At most once per 30 s, one call at a time, never throws. */
  refreshHost(): Promise<void>;
}

const HOST_REFRESH_MS = 30_000;

const FAILURES: Record<ServeFailure, string> = {
  denied: "Tailscale refused: only root or the Tailscale operator can change Serve. Run the command below with sudo, or run `sudo tailscale set --operator=$USER` once, then press Enable again.",
  "https-off": "HTTPS certificates are off on this tailnet. Turn them on in the Tailscale admin console (DNS page), then press Enable again.",
  "needs-approval": "Serve is off on this tailnet. Open the link, approve it, then press Enable again.",
  timeout: "Tailscale did not answer in time. Run the command below by hand.",
  failed: "Tailscale could not share the dashboard. Run the command below to see why.",
};
const LOGIN_FAILURES = {
  denied: "Tailscale refused: only root or the Tailscale operator can sign in. Run the command below once, then press Check again.",
  timeout: "Tailscale did not give a sign-in link in time. Run the command below by hand.",
  failed: "Tailscale could not start the sign-in. Run the command below to see why.",
} as const;
const MAGIC_DNS_OFF = "MagicDNS is off on this tailnet. Turn on MagicDNS and HTTPS certificates in the Tailscale admin console, then check again.";

/** The command that installs Tailscale here; null when no one-liner is safe (the Mac app is the right install). */
export function installCommand(platform: NodeJS.Platform): string | null {
  if (platform === "linux") return "curl -fsSL https://tailscale.com/install.sh | sh";
  return platform === "win32" ? "winget install --id tailscale.tailscale" : null;
}

/** On Linux, --operator also lets the dashboard run Serve later without root. */
export function loginCommand(platform: NodeJS.Platform): string {
  return platform === "linux" ? "sudo tailscale up --operator=$USER" : "tailscale up";
}

/** The address of the best serve entry that proxies to this dashboard, or null. */
export function remoteUrl(serve: ServeStatus, dnsName: string, port: number): string | null {
  const found: number[] = [];
  for (const [key, web] of Object.entries(serve.Web ?? {})) {
    const cut = key.lastIndexOf(":");
    const servePort = Number(key.slice(cut + 1));
    if (cut < 0 || !Number.isInteger(servePort) || key.slice(0, cut).toLowerCase() !== dnsName) continue;
    if (serve.TCP?.[String(servePort)]?.HTTPS !== true || !proxiesTo(web.Handlers?.["/"]?.Proxy, port)) continue;
    found.push(servePort);
  }
  if (found.length === 0) return null;
  const best = found.includes(443) ? 443 : Math.min(...found);
  return best === 443 ? `https://${dnsName}` : `https://${dnsName}:${best}`;
}

function proxiesTo(proxy: string | undefined, port: number): boolean {
  if (proxy === undefined) return false;
  try {
    const url = new URL(proxy);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.port === String(port) && (url.pathname === "/" || url.pathname === "");
  } catch {
    return false;
  }
}

export function createRemoteAccess({ port, platform, run, now }: RemoteAccessOptions): RemoteAccessService {
  let knownHost: string | null = null;
  let lastRefresh: number | null = null;
  let refreshing: Promise<void> | null = null;
  let enabling: Promise<RemoteAccess> | null = null;
  let signingIn: Promise<RemoteAccess> | null = null;

  const needsEnable = (error: string | null, approveUrl: string | null = null): RemoteAccess => ({ state: "needs-enable", command: serveCommand(port), error, approveUrl });

  const needsLogin = (loginUrl: string | null, error: string | null = null): RemoteAccess => ({ state: "needs-login", loginUrl, error, command: loginCommand(platform) });

  /** The answer, with the serve list it came from when Tailscale runs but does not serve us yet. */
  // serve is null when Tailscale did not list its Serve entries.
  async function read(): Promise<{ access: RemoteAccess; serve?: ServeStatus | null }> {
    try {
      const self = await readSelf(run);
      // The name stops being allowed once Tailscale no longer gives it.
      knownHost = self.kind === "running" ? self.dnsName : null;
      if (self.kind === "missing") return { access: { state: "not-installed", installCommand: installCommand(platform) } };
      if (self.kind === "needs-login") return { access: needsLogin(self.authUrl) };
      if (self.kind === "down") return { access: { state: "stopped" } };
      if (self.dnsName === null) return { access: { state: "error", message: MAGIC_DNS_OFF } };
      const serve = await readServe(run);
      const url = serve ? remoteUrl(serve, self.dnsName, port) : null;
      return url ? { access: { state: "ready", url } } : { access: needsEnable(null), serve };
    } catch (error) {
      if (error instanceof IntegrationError) return { access: { state: "error", message: error.message } };
      throw error;
    }
  }

  async function runEnable(): Promise<RemoteAccess> {
    const { access, serve } = await read();
    if (access.state !== "needs-enable") return access;
    // Never take over a port that Tailscale already serves, or may serve, for something else.
    if (serve === null) return needsEnable("Tailscale did not list its Serve entries. Run the command below by hand.");
    if (serve?.TCP?.[String(port)]) return needsEnable(`Tailscale already uses port ${port} for something else. Change it by hand.`);
    const result = await enableServe(run, port);
    if (!result.ok) return needsEnable(FAILURES[result.reason], result.approveUrl);
    const after = (await read()).access;
    return after.state === "needs-enable" ? needsEnable("Tailscale accepted the command, but the dashboard is not in its Serve list yet. Check again.") : after;
  }

  async function runLogin(): Promise<RemoteAccess> {
    const { access } = await read();
    if (access.state !== "needs-login") return access;
    const result = await startLogin(run);
    if (!result.ok) return needsLogin(access.loginUrl, LOGIN_FAILURES[result.reason]);
    return result.url ? needsLogin(result.url) : (await read()).access;
  }

  return {
    status: async () => (await read()).access,
    enable: () => (enabling ??= runEnable().finally(() => (enabling = null))),
    login: () => (signingIn ??= runLogin().finally(() => (signingIn = null))),
    host: () => knownHost,
    refreshHost() {
      if (refreshing) return refreshing;
      if (lastRefresh !== null && now() - lastRefresh < HOST_REFRESH_MS) return Promise.resolve();
      lastRefresh = now();
      refreshing = readSelf(run)
        .then((self) => {
          knownHost = self.kind === "running" ? self.dnsName : null;
        })
        .catch(() => {})
        .finally(() => (refreshing = null));
      return refreshing;
    },
  };
}
