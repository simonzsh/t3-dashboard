export const DEFAULT_PORT = 4300;

export type ReadFile = (path: string) => string;

/** The PORT variable; an empty or invalid value means the default port. */
export function envPort(env: Record<string, string | undefined>): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}

/** T3_DASHBOARD_ALLOWED_HOSTS: extra Host and Origin names, besides 127.0.0.1 and localhost. */
export function envAllowedHosts(env: Record<string, string | undefined>): string[] {
  return (env.T3_DASHBOARD_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

/** Seconds a request may stay silent: the first usage read walks every recent thread and can exceed Bun's 10 s default. */
export const IDLE_TIMEOUT_S = 60;
