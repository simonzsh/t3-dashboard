import type { RemoteAccess } from "../../shared/api.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { TailscaleRun } from "../integrations/tailscale/cli.ts";
import { enableServe, readSelf, readServe, serveCommand, type ServeFailure } from "../integrations/tailscale/client.ts";
import type { ServeStatus } from "../integrations/tailscale/schemas.ts";

export interface RemoteAccessOptions {
  /** The port this dashboard listens on. */
  port: number;
  run: TailscaleRun;
  now(): number;
}

export interface RemoteAccessService {
  status(): Promise<RemoteAccess>;
  enable(): Promise<RemoteAccess>;
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
const MAGIC_DNS_OFF = "MagicDNS is off on this tailnet. Turn on MagicDNS and HTTPS certificates in the Tailscale admin console, then check again.";

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

export function createRemoteAccess({ port, run, now }: RemoteAccessOptions): RemoteAccessService {
  let knownHost: string | null = null;
  let lastRefresh: number | null = null;
  let refreshing: Promise<void> | null = null;
  let enabling: Promise<RemoteAccess> | null = null;

  const needsEnable = (error: string | null, approveUrl: string | null = null): RemoteAccess => ({ state: "needs-enable", command: serveCommand(port), error, approveUrl });

  /** The answer, with the serve list it came from when Tailscale runs but does not serve us yet. */
  async function read(): Promise<{ access: RemoteAccess; serve?: ServeStatus }> {
    try {
      const self = await readSelf(run);
      if (self.kind === "missing") return { access: { state: "not-installed" } };
      if (self.kind === "down") return { access: { state: "stopped" } };
      if (self.dnsName === null) return { access: { state: "error", message: MAGIC_DNS_OFF } };
      knownHost = self.dnsName;
      const serve = (await readServe(run)) ?? {};
      const url = remoteUrl(serve, self.dnsName, port);
      return url ? { access: { state: "ready", url } } : { access: needsEnable(null), serve };
    } catch (error) {
      if (error instanceof IntegrationError) return { access: { state: "error", message: error.message } };
      throw error;
    }
  }

  async function runEnable(): Promise<RemoteAccess> {
    const { access, serve } = await read();
    if (access.state !== "needs-enable") return access;
    // Never take over a port that Tailscale already serves for something else.
    if (serve?.TCP?.[String(port)]) return needsEnable(`Tailscale already uses port ${port} for something else. Change it by hand.`);
    const result = await enableServe(run, port);
    if (!result.ok) return needsEnable(FAILURES[result.reason], result.approveUrl);
    const after = (await read()).access;
    return after.state === "needs-enable" ? needsEnable("Tailscale accepted the command, but the dashboard is not in its Serve list yet. Check again.") : after;
  }

  return {
    status: async () => (await read()).access,
    enable: () => (enabling ??= runEnable().finally(() => (enabling = null))),
    host: () => knownHost,
    refreshHost() {
      if (refreshing) return refreshing;
      if (lastRefresh !== null && now() - lastRefresh < HOST_REFRESH_MS) return Promise.resolve();
      lastRefresh = now();
      refreshing = readSelf(run)
        .then((self) => {
          if (self.kind === "running" && self.dnsName !== null) knownHost = self.dnsName;
        })
        .catch(() => {})
        .finally(() => (refreshing = null));
      return refreshing;
    },
  };
}
