import { join } from "node:path";
import type { McpStatus } from "../../../shared/agentSetup.ts";

export interface ClaudeListResult {
  ok: boolean;
  statuses: Map<string, { status: McpStatus; detail: string | null }>;
  error: string | null;
}

/** Same shape as the T3 command runner; a structural type keeps the integrations apart. */
export type Run = (command: string, args: string[], options: { timeoutMs: number }) => Promise<{ code: number | null; stdout: string }>;

const LIST_TIMEOUT_MS = 30_000;
// `name: target - <symbol> <label>`; claude.ai connectors start with their own prefix and are skipped.
const LINE = /^(.+?): .*? - ([✔!✘⏸⊘])\s*(.*)$/u;

/** Looks for the claude program: a service starts with a short PATH, so common folders are tried too. */
export function findClaude(home: string, exists: (path: string) => boolean, which: (name: string) => string | null): string | null {
  return which("claude") ?? [join(home, ".local", "bin", "claude"), join(home, ".claude", "local", "claude")].find(exists) ?? null;
}

/** Only a fixed word or a code reaches the result: the line text is never passed on. */
export function parseClaudeMcpList(stdout: string): ClaudeListResult["statuses"] {
  const statuses: ClaudeListResult["statuses"] = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const match = LINE.exec(line.trim());
    if (!match || match[1]!.startsWith("claude.ai ")) continue;
    const [, name = "", symbol = "", text = ""] = match;
    if (symbol === "✔") statuses.set(name, { status: "reachable", detail: null });
    else if (symbol === "!" && /^Needs authentication/i.test(text)) statuses.set(name, { status: "needs-auth", detail: null });
    else if (symbol === "✘") statuses.set(name, { status: "failing", detail: /\b[A-Z][A-Z_]{2,}\b/.exec(text)?.[0] ?? "failed" });
    else statuses.set(name, { status: "configured", detail: (text.split(" (")[0] ?? "").replace(/[^\w .-]/g, "").trim().slice(0, 40) || null });
  }
  return statuses;
}

export async function claudeMcpList(run: Run, bin: string): Promise<ClaudeListResult> {
  const result = await run(bin, ["mcp", "list"], { timeoutMs: LIST_TIMEOUT_MS });
  if (result.code !== 0) return { ok: false, statuses: new Map(), error: result.code === null ? "claude mcp list did not finish" : `claude mcp list exited with code ${result.code}` };
  return { ok: true, statuses: parseClaudeMcpList(result.stdout), error: null };
}

