import { issues } from "../contract.ts";
import { Checks, type SystemReport } from "../drift.ts";
import { IntegrationError } from "../errors.ts";
import { LinearClient, QUERY, VIEWER_QUERY, type FetchLike } from "./client.ts";
import { AssignedIssuesPage, Viewer } from "./schemas.ts";

/** The viewer and one page of assigned issues, with the board's own query. Nothing is written. */
export async function checkLinear(apiKey: string, fetchImpl: FetchLike = fetch): Promise<SystemReport> {
  if (apiKey === "") return { system: "linear", checks: 0, findings: [], skipped: "no Linear key is configured" };
  const client = new LinearClient(fetchImpl);
  const checks = new Checks();
  const viewer = await checks.run("viewer", async () => checks.issues("viewer", issues(Viewer, await client.query(apiKey, VIEWER_QUERY))));
  if (!viewer) return checks.report("linear");
  await checks.run("assigned issues", async () => {
    try {
      checks.issues("assigned issues", issues(AssignedIssuesPage, await client.query(apiKey, QUERY, {})));
    } catch (error) {
      // The key just worked, so a GraphQL error (no HTTP status) means Linear refuses the board query itself.
      if (error instanceof IntegrationError && error.kind === "refused" && error.status === undefined) return checks.breaking("assigned issues: Linear returned a GraphQL error for the board query");
      throw error;
    }
  });
  return checks.report("linear");
}
