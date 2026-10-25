import { describe, type Issue } from "./contract.ts";
import { IntegrationError, type IntegrationSystem } from "./errors.ts";

// The contract report can go into a public issue: it holds paths, types and enum names, never a value.
/** breaking: what the dashboard reads or sends changed; unchecked: the check could not run. */
export type Level = "breaking" | "unchecked";

export interface Finding {
  level: Level;
  text: string;
}

export interface SystemReport {
  system: IntegrationSystem;
  version?: string;
  checks: number;
  findings: Finding[];
  /** Set when the system is not configured here: the run is still ok. */
  skipped?: string;
}

/** An error whose message is written by a check and holds no value. */
export class CheckError extends Error {}

const KIND_TEXT: Record<IntegrationError["kind"], string> = { unreachable: "unreachable", refused: "refused", protocol: "unreadable answer", "not-authenticated": "token refused" };

// Other messages can quote a host, a thread title or a response: only the error type is kept.
function reason(error: unknown): string {
  if (error instanceof CheckError) return error.message;
  if (error instanceof IntegrationError) return `${KIND_TEXT[error.kind]}${error.status ? ` (HTTP ${error.status})` : ""}`;
  return `failed (${error instanceof Error ? error.name : typeof error})`;
}

export class Checks {
  private readonly findings: Finding[] = [];
  private count = 0;

  breaking(text: string): void {
    this.add("breaking", text);
  }

  unchecked(text: string): void {
    this.add("unchecked", text);
  }

  issues(where: string, list: Issue[]): void {
    for (const issue of list) this.breaking(`${where}: ${describe({ ...issue, path: issue.path.replace(/\[\d+\]/g, "[]") })}`);
  }

  /** Runs one check. A protocol error is drift; any other error means the check could not run. */
  async run(where: string, check: () => unknown): Promise<boolean> {
    this.count++;
    try {
      await check();
      return true;
    } catch (error) {
      if (error instanceof IntegrationError && error.kind === "protocol") this.breaking(`${where}: ${error.message}`);
      else this.unchecked(`${where}: ${reason(error)}`);
      return false;
    }
  }

  report(system: IntegrationSystem, version?: string): SystemReport {
    return { system, ...(version && { version }), checks: this.count, findings: this.findings };
  }

  private add(level: Level, text: string): void {
    if (!this.findings.some((finding) => finding.text === text)) this.findings.push({ level, text });
  }
}

const has = (reports: SystemReport[], level: Level) => reports.some((report) => report.findings.some((finding) => finding.level === level));

export const exitCode = (reports: SystemReport[]): 0 | 1 | 2 => (has(reports, "breaking") ? 1 : has(reports, "unchecked") ? 2 : 0);

const RESULTS = ["no change", "breaking change", "some checks could not run"];

function status(report: SystemReport): string {
  if (report.skipped) return `SKIPPED, ${report.skipped}`;
  const state = has([report], "breaking") ? "CHANGED" : has([report], "unchecked") ? "COULD NOT RUN" : "OK";
  return `${state}, ${report.checks} check${report.checks === 1 ? "" : "s"}`;
}

export function formatReport(reports: SystemReport[]): string {
  const lines = reports.flatMap((report) => [
    `${report.system}${report.version ? ` (version ${report.version})` : ""}: ${status(report)}`,
    ...(["breaking", "unchecked"] as const).flatMap((level) =>
      report.findings.filter((finding) => finding.level === level).map((finding) => `  - ${level === "breaking" ? "breaking" : "could not run"}: ${finding.text}`),
    ),
  ]);
  const code = exitCode(reports);
  return [...lines, "", `Result: ${RESULTS[code]} (exit ${code})`].join("\n");
}
