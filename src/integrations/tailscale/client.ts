import { IntegrationError } from "../errors.ts";
import { parse } from "../contract.ts";
import type { TailscaleRun } from "./cli.ts";
import { ServeStatus, TailscaleStatus } from "./schemas.ts";

export const STATUS_TIMEOUT_MS = 5_000;
export const SERVE_TIMEOUT_MS = 15_000;

export const serveArgs = (port: number): string[] => ["serve", "--bg", `--https=${port}`, `http://127.0.0.1:${port}`];
export const serveCommand = (port: number): string => `tailscale ${serveArgs(port).join(" ")}`;

export type SelfStatus = { kind: "missing" } | { kind: "down" } | { kind: "needs-login"; authUrl: string | null } | { kind: "running"; dnsName: string | null };

function json(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new IntegrationError(`Unexpected ${what}: not JSON`, { system: "tailscale", kind: "protocol" });
  }
}

export async function readSelf(run: TailscaleRun): Promise<SelfStatus> {
  const result = await run(["status", "--json"], { timeoutMs: STATUS_TIMEOUT_MS });
  if (result.missing) return { kind: "missing" };
  if (result.code !== 0) return { kind: "down" };
  const status = parse(TailscaleStatus, json(result.stdout, "Tailscale status"), { system: "tailscale", what: "Tailscale status" });
  if (status.BackendState === "NeedsLogin" || status.BackendState === "NeedsMachineAuth") {
    const authUrl = status.AuthURL ?? "";
    return { kind: "needs-login", authUrl: authUrl.startsWith("https://") ? authUrl : null };
  }
  if (status.BackendState !== "Running") return { kind: "down" };
  const name = (status.Self?.DNSName ?? "").toLowerCase().replace(/\.$/, "");
  return { kind: "running", dnsName: name === "" ? null : name };
}

/** Null when Tailscale cannot say, for example when only the operator may read the list. */
export async function readServe(run: TailscaleRun): Promise<ServeStatus | null> {
  const result = await run(["serve", "status", "--json"], { timeoutMs: STATUS_TIMEOUT_MS });
  if (result.code !== 0) return null;
  if (result.stdout.trim() === "") return {};
  return parse(ServeStatus, json(result.stdout, "Tailscale serve status"), { system: "tailscale", what: "Tailscale serve status" });
}

/** `tailscale login` blocks until the user signs in, so a timeout after the link is the normal path. */
export const LOGIN_TIMEOUT_MS = 10_000;
const LOGIN_LINK = /https:\/\/login\.tailscale\.com\/\S+/;
const DENIED = /access denied|permission denied|operator|must be root|sudo/i;

export async function startLogin(run: TailscaleRun): Promise<{ ok: true; url: string | null } | { ok: false; reason: "denied" | "timeout" | "failed" }> {
  const result = await run(["login"], { timeoutMs: LOGIN_TIMEOUT_MS });
  const url = (result.stdout + "\n" + result.stderr).match(LOGIN_LINK)?.[0] ?? null;
  if (url || result.code === 0) return { ok: true, url };
  return { ok: false, reason: result.code === null ? "timeout" : DENIED.test(result.stderr) ? "denied" : "failed" };
}

export type ServeFailure = "denied" | "https-off" | "needs-approval" | "timeout" | "failed";

const APPROVE_LINK = /https:\/\/login\.tailscale\.com\/\S+/;

export async function enableServe(run: TailscaleRun, port: number): Promise<{ ok: true } | { ok: false; reason: ServeFailure; approveUrl: string | null }> {
  const result = await run(serveArgs(port), { timeoutMs: SERVE_TIMEOUT_MS });
  if (result.code === 0) return { ok: true };
  // Tailscale prints the approve link, then waits: it can be in a timed-out run.
  const approveUrl = (result.stdout + "\n" + result.stderr).match(APPROVE_LINK)?.[0] ?? null;
  const reason: ServeFailure = approveUrl
    ? "needs-approval"
    : result.code === null
      ? "timeout"
      : DENIED.test(result.stderr)
        ? "denied"
        : /https|certificate/i.test(result.stderr)
          ? "https-off"
          : "failed";
  return { ok: false, reason, approveUrl };
}
