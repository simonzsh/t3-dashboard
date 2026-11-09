import type { GitHubConnection } from "../../../shared/settings.ts";
import type { GhRun } from "./gh.ts";

export async function githubConnection(run: GhRun): Promise<GitHubConnection> {
  // Only the exit code leaves the integration: auth output can contain account details.
  const result = await run(["auth", "status", "--hostname", "github.com"]);
  if (result.missing) return { status: "not-installed" };
  if (result.code === 0) return { status: "connected" };
  if (result.code === 1 || result.code === 4) return { status: "not-connected" };
  return { status: "error" };
}
