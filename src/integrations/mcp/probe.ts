export type ProbeResult = { kind: "http"; status: number } | { kind: "error"; code: string };

/** The part of `fetch` the probe uses, so a test passes a fake. */
export type ProbeFetch = (url: string, init: { method: "GET"; headers: Record<string, string>; redirect: "manual"; credentials: "omit"; signal: AbortSignal }) => Promise<{ status: number; body?: { cancel(): unknown } | null }>;

const ACCEPT = "application/json, text/event-stream";

/** Reachability only: no config header is sent, a redirect is not followed, and the answer text is never read. */
export async function probeMcpHttp(url: string, { fetch, timeoutMs = 3000 }: { fetch: ProbeFetch; timeoutMs?: number }): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", headers: { accept: ACCEPT }, redirect: "manual", credentials: "omit", signal: controller.signal });
    // An event-stream answer never ends: drop it.
    void Promise.resolve(res.body?.cancel()).catch(() => {});
    return { kind: "http", status: res.status };
  } catch (error) {
    if (controller.signal.aborted) return { kind: "error", code: "TIMEOUT" };
    const code = (error as { code?: unknown } | null)?.code;
    return { kind: "error", code: typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : "ERROR" };
  } finally {
    clearTimeout(timer);
  }
}
