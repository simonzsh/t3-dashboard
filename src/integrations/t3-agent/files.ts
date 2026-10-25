import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { matches, type Schema } from "../contract.ts";
import { BrainProject, BrainWorkspace, Job, RoutineThread, RunAt } from "./schemas.ts";

export interface Brain {
  name: string;
  workspace: string | null;
  projectId: string | null;
  error: string | null;
}

/** A job that cannot be read or does not match the schema has a null `job`. */
export interface JobFile {
  id: string;
  job: Job | null;
}

export interface Workspace {
  jobs: JobFile[];
  threads: Record<string, RoutineThread>;
  runs: Record<string, string>;
}

export const agentConfigDir = (env: Record<string, string | undefined>, homedir: string): string =>
  env.T3_DASHBOARD_AGENT_CONFIG_DIR ?? join(homedir, ".config", "t3-agent");

const text = (value: string): string | null => (value === "" ? null : value);

// These files also hold a token: only `workspace` and `projectId` leave this function,
// and errors never quote the content.
export function loadBrains(dir: string): Brain[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort()
    .map((name) => {
      try {
        const parsed: unknown = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
        const workspace = matches(BrainWorkspace, parsed) ? text(parsed.workspace) : null;
        if (!workspace) return { name, workspace: null, projectId: null, error: "Missing workspace field" };
        return { name, workspace, projectId: matches(BrainProject, parsed) ? text(parsed.projectId) : null, error: null };
      } catch {
        return { name, workspace: null, projectId: null, error: "Unreadable config file" };
      }
    });
}

// Missing or broken state files only lose the extras: the jobs still show.
function readState<T>(workspace: string, file: string, entry: Schema<T>): Record<string, T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(workspace, "state", file), "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => matches(entry, value)));
}

function readJob(workspace: string, file: string): Job | null {
  try {
    const job: unknown = parseYaml(readFileSync(join(workspace, "jobs", file), "utf8"));
    return matches(Job, job) ? job : null;
  } catch {
    return null;
  }
}

/** Jobs and routine state of one brain, or null when its folder does not exist. */
export function readWorkspace(workspace: string): Workspace | null {
  if (!statSync(workspace, { throwIfNoEntry: false })?.isDirectory()) return null;
  let files: string[] = [];
  try {
    files = readdirSync(join(workspace, "jobs")).filter((file) => file.endsWith(".yaml")).sort();
  } catch {
    // No jobs folder: the brain has no job yet.
  }
  return {
    jobs: files.map((file) => ({ id: file.slice(0, -".yaml".length), job: readJob(workspace, file) })),
    threads: readState(workspace, "routine-threads.json", RoutineThread),
    runs: readState(workspace, "runs.json", RunAt),
  };
}
