import type { TailscaleRun } from "../../integrations/tailscale/cli.ts";

const NAME = "dashboard.example.ts.net";

/** An in-memory Tailscale: it starts without a serve entry, and `serve --bg` adds one. Never runs the real program. */
export function demoTailscale(): TailscaleRun {
  let servePort: number | null = null;
  return async (args) => {
    const ok = (value: unknown) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
    if (args[0] === "login") return { code: null, stdout: "To authenticate, visit:\n\n\thttps://login.tailscale.com/a/demo\n", stderr: "" };
    if (args[0] === "status") return ok({ BackendState: "Running", Self: { DNSName: `${NAME}.` } });
    if (args[1] === "status") {
      if (servePort === null) return ok({});
      const p = servePort;
      return ok({ TCP: { [p]: { HTTPS: true } }, Web: { [`${NAME}:${p}`]: { Handlers: { "/": { Proxy: `http://127.0.0.1:${p}` } } } } });
    }
    const port = Number(args.find((arg) => arg.startsWith("--https="))?.slice("--https=".length));
    if (!Number.isInteger(port)) return { code: 1, stdout: "", stderr: "unsupported" };
    servePort = port;
    return { code: 0, stdout: "", stderr: "" };
  };
}
