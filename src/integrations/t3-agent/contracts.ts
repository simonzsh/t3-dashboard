import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { issues, type Schema } from "../contract.ts";
import { Checks, type SystemReport } from "../drift.ts";
import { jobFiles, jobsDir, loadBrains, stateFile, type StateName } from "./files.ts";
import { Job, RoutineThread, RunAt } from "./schemas.ts";

const STATE: [StateName, Schema<unknown>][] = [
  ["threads", RoutineThread],
  ["runs", RunAt],
];

// Brains, jobs and state entries are named by position: their names and paths are private.
export async function checkAgentFiles(configDir: string): Promise<SystemReport> {
  const brains = loadBrains(configDir);
  if (brains.length === 0) return { system: "t3-agent", checks: 0, findings: [], skipped: "no t3-agent config found" };
  const checks = new Checks();
  for (const [index, brain] of brains.entries()) {
    const where = `brain[${index}]`;
    await checks.run(`${where} config`, () => brain.error && checks.breaking(`${where} config: ${brain.error}`));
    const workspace = brain.workspace;
    if (workspace === null) continue;
    for (const [jobIndex, file] of jobFiles(workspace).entries()) {
      await checks.run(`${where} job[${jobIndex}]`, () => {
        let job: unknown;
        try {
          job = parseYaml(readFileSync(join(jobsDir(workspace), file), "utf8"));
        } catch {
          return checks.breaking(`${where} job[${jobIndex}]: unreadable YAML`);
        }
        checks.issues(`${where} job[${jobIndex}]`, issues(Job, job));
      });
    }
    for (const [name, entry] of STATE) await checks.run(`${where} state ${name}`, () => checkState(checks, `${where} state ${name}`, stateFile(workspace, name), entry));
  }
  return checks.report("t3-agent");
}

function checkState(checks: Checks, where: string, file: string, entry: Schema<unknown>): void {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return; // No state yet: t3-agent writes it after the first run.
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return checks.breaking(`${where}: unreadable JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return checks.breaking(`${where}: should be an object keyed by job`);
  for (const value of Object.values(parsed)) checks.issues(`${where} entry`, issues(entry, value));
}
