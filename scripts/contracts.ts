import { join } from "node:path";
import { runContracts } from "../src/app/contracts.ts";
import { exitCode, formatReport } from "../src/integrations/drift.ts";

// Read-only check of T3 Code, Linear and GitHub. docs/contracts.md explains the report.
const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--update-snapshot");
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(" ")}\nUsage: bun run contracts [--update-snapshot]`);
  // 64 (EX_USAGE): 2 already means "some checks could not run".
  process.exit(64);
}

const reports = await runContracts({
  env: process.env,
  snapshotFile: join(import.meta.dir, "..", "contracts", "t3-commands.snapshot.json"),
  updateSnapshot: args.includes("--update-snapshot"),
});
console.log(formatReport(reports));
process.exit(exitCode(reports));
