import { readFileSync, writeFileSync } from "node:fs";
import type { ApprovalDecision, ModelSelection } from "../../../shared/api.ts";
import { RUNTIME_MODES } from "../../../shared/limits.ts";
import { ACTIVE_STATUSES, FAILED_STATUSES, FINISHED_STATUSES } from "../../../shared/status.ts";
import { issues, matches } from "../contract.ts";
import { CheckError, Checks, type SystemReport } from "../drift.ts";
import { IntegrationError } from "../errors.ts";
import { bundleDir, checkPayloads, compareSnapshot, extractShapes, missingTags, readBundle, type Shape, type StructSpec } from "./bundle.ts";
import { ORCHESTRATION_PROTOCOL, RPC, T3Client } from "./client.ts";
import {
  approvalCommand,
  createThreadCommands,
  dismissCommand,
  settleCommand,
  interruptCommand,
  messageCommand,
  modelSelectionCommand,
  runtimeModeCommand,
  userInputCommand,
  type UnsentCommand,
} from "./commands.ts";
import type { RpcConnection } from "./rpc.ts";
import { runtimeFile, readServerVersion, resolveOrigin } from "./runtime.ts";
import { ProjectionResponse, RawConfig, RawThread, RuntimeOrigin, RuntimeVersion, ShellItem, type ImageUpload } from "./schemas.ts";

export interface T3ContractOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  /** The dashboard's stored token, used as is: the check never mints or refreshes one. */
  token: string | null;
  readFile: (path: string) => string;
  snapshotFile: string;
  updateSnapshot: boolean;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
}

const IMAGE_UPLOAD = "image upload";
const APPROVALS: ApprovalDecision[] = ["accept", "acceptForSession", "decline"];
const KNOWN_STATUSES = new Set(["idle", ...ACTIVE_STATUSES, ...FINISHED_STATUSES, ...FAILED_STATUSES]);
const SHELL_TIMEOUT_MS = 15_000;
const MAX_PROJECTIONS = 3;

// Every payload the dashboard can send, with fixed ids: only keys and enum values are compared.
export function samplePayloads(): Record<string, Record<string, unknown>[]> {
  const selection: ModelSelection = { instanceId: "i", model: "m" };
  const message = { messageId: "m", attachments: [] };
  const commands: UnsentCommand[] = [
    ...createThreadCommands("t", { projectId: "p", title: "x", text: "x", modelSelection: selection }, message),
    messageCommand("t", "x", message, { mode: { type: "queue_after_active" }, steer: true }),
    modelSelectionCommand("t", selection),
    ...RUNTIME_MODES.map((mode) => runtimeModeCommand("t", mode)),
    interruptCommand("t", "r"),
    ...APPROVALS.map((decision) => approvalCommand("t", "q", decision)),
    userInputCommand("t", "q", { a: "b" }),
    dismissCommand("t", "q"),
    settleCommand("t"),
  ];
  const payloads: Record<string, Record<string, unknown>[]> = {};
  for (const command of commands) (payloads[String(command.type)] ??= []).push({ ...command, commandId: "c" });
  const upload: Required<ImageUpload> = { type: "image", name: "a.png", mimeType: "image/png", sizeBytes: 1, dataUrl: "data:" };
  payloads[IMAGE_UPLOAD] = [{ ...upload }];
  return payloads;
}

const specsFor = (payloads: Record<string, unknown>): StructSpec[] =>
  Object.keys(payloads).map((name) => (name === IMAGE_UPLOAD ? { name, type: "image", marker: "dataUrl" } : { name, type: name, marker: "commandId" }));

const sortedShapes = (shapes: Record<string, Shape>): Record<string, Shape> =>
  Object.fromEntries(Object.keys(shapes).sort().map((name) => [name, Object.fromEntries(Object.entries(shapes[name]!).sort(([a], [b]) => a.localeCompare(b)))]));

/** The runtime file, the command schemas of the client bundle, then the live read endpoints. */
export async function checkT3(options: T3ContractOptions): Promise<SystemReport> {
  const checks = new Checks();
  const file = runtimeFile(options.env, options.homedir);
  let version: string | null = null;
  await checks.run("server-runtime.json", () => {
    let raw: unknown;
    try {
      raw = JSON.parse(options.readFile(file));
    } catch {
      throw new CheckError("missing or unreadable: T3 is not running");
    }
    checks.issues("server-runtime.json", [...issues(RuntimeOrigin, raw), ...issues(RuntimeVersion, raw)]);
    version = readServerVersion(file, options.readFile);
  });
  if (version) await checkBundle(checks, bundleDir(options.env, options.homedir, version), options);
  if (options.token === null) checks.unchecked("live reads: no stored dashboard token (start the dashboard once)");
  else await checkLive(checks, options, options.token);
  return checks.report("t3", version ?? undefined);
}

async function checkBundle(checks: Checks, dir: string, options: T3ContractOptions): Promise<void> {
  let sources: string[] = [];
  const read = await checks.run("client bundle", () => {
    try {
      sources = readBundle(dir);
    } catch {
      throw new CheckError("no client bundle for this T3 version");
    }
  });
  if (!read) return;
  await checks.run("RPC tags", () => {
    for (const tag of missingTags(sources, Object.values(RPC))) checks.breaking(`RPC ${tag}: not in the T3 client`);
  });
  await checks.run("commands", () => {
    const payloads = samplePayloads();
    let extraction;
    try {
      extraction = extractShapes(sources, specsFor(payloads));
    } catch {
      throw new CheckError("cannot read the command schemas of this T3 build");
    }
    const { shapes, missing, failed } = extraction;
    for (const name of missing) checks.breaking(`command ${name}: no longer in the T3 client`);
    for (const name of failed) checks.unchecked(`command ${name}: cannot read its schema`);
    for (const problem of checkPayloads(shapes, payloads)) checks.breaking(`command ${problem}`);
    if (options.updateSnapshot) {
      if (missing.length + failed.length > 0) throw new CheckError("snapshot not updated: some commands could not be read");
      writeFileSync(options.snapshotFile, `${JSON.stringify(sortedShapes(shapes), null, 2)}\n`);
    }
    let saved: Record<string, Shape>;
    try {
      saved = JSON.parse(readFileSync(options.snapshotFile, "utf8"));
    } catch {
      throw new CheckError("no snapshot: run bun run contracts --update-snapshot");
    }
    // Missing and unreadable commands are already reported above.
    const unread = new Set([...missing, ...failed]);
    const keep = (all: Record<string, Shape>) => Object.fromEntries(Object.entries(all).filter(([name]) => !unread.has(name)));
    for (const change of compareSnapshot(keep(saved), keep(shapes))) checks.breaking(`snapshot ${change}`);
  });
}

async function checkLive(checks: Checks, options: T3ContractOptions, token: string): Promise<void> {
  const origin = resolveOrigin(runtimeFile(options.env, options.homedir), options.readFile);
  const client = new T3Client({ origin: async () => origin, token: () => token, fetch: options.fetch, WebSocket: options.WebSocket, warn: () => {} });
  let connection: RpcConnection | undefined;
  if (!(await checks.run("websocket ticket", async () => (connection = await client.openSocket())))) return;
  try {
    await checks.run(RPC.getConfig, async () => checkConfig(checks, await connection!.request(RPC.getConfig, {})));
  } finally {
    connection?.close();
  }
  let threads: RawThread[] = [];
  await checks.run(RPC.subscribeShell, async () => {
    const items = await shellSnapshot(client);
    checks.issues(RPC.subscribeShell, items.flatMap((item) => issues(ShellItem, item)));
    threads = threadsOf(items);
    for (const status of new Set(threads.map((thread) => thread.status))) {
      if (status && !KNOWN_STATUSES.has(status)) checks.breaking(`${RPC.subscribeShell}: thread.status has a new value "${status}"`);
    }
  });
  for (const id of pickThreads(threads)) {
    await checks.run("thread projection", async () => {
      let answer: unknown;
      try {
        answer = await client.http("GET", `/api/orchestration/threads/${encodeURIComponent(id)}`);
      } catch (error) {
        // Its message names the thread id: keep the check's own words.
        if (error instanceof IntegrationError && error.kind === "protocol") return checks.breaking("thread projection: unreadable JSON");
        throw error;
      }
      checks.issues("thread projection", issues(ProjectionResponse, answer));
    });
  }
}

function checkConfig(checks: Checks, config: unknown): void {
  checks.issues(RPC.getConfig, issues(RawConfig, config));
  if (!matches(RawConfig, config)) return;
  const protocol = config.environment?.orchestrationProtocolVersion;
  if (protocol != null && String(protocol) !== ORCHESTRATION_PROTOCOL) {
    checks.breaking(`${RPC.getConfig}: environment.orchestrationProtocolVersion is ${protocol}, the dashboard speaks ${ORCHESTRATION_PROTOCOL}`);
  }
  const modes = new Set((config.providers ?? []).flatMap((provider) => provider.supportedRuntimeModes ?? []));
  for (const mode of modes) {
    if (!(RUNTIME_MODES as string[]).includes(mode)) checks.breaking(`${RPC.getConfig}: providers[].supportedRuntimeModes has a new value "${mode}"`);
  }
}

// Collects the stream until `synchronized`, then stops it: the same first read as the dashboard.
function shellSnapshot(client: T3Client): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const items: unknown[] = [];
    const finish = (error?: Error) => {
      clearTimeout(timer);
      stream.cancel();
      if (error) reject(error);
      else resolve(items);
    };
    const timer = setTimeout(() => finish(new CheckError(`no synchronized item within ${SHELL_TIMEOUT_MS / 1000} s`)), SHELL_TIMEOUT_MS);
    const stream = client.subscribeShell(
      (values) => {
        items.push(...values);
        if (values.some((value) => (value as { kind?: unknown }).kind === "synchronized")) finish();
      },
      (error) => finish(error ?? new CheckError("the stream ended before synchronized")),
    );
  });
}

function threadsOf(items: unknown[]): RawThread[] {
  const found = items.flatMap((item) => {
    const { kind, snapshot, thread } = item as { kind?: unknown; snapshot?: { threads?: unknown }; thread?: unknown };
    if (kind === "snapshot" && Array.isArray(snapshot?.threads)) return snapshot.threads;
    return kind === "thread.updated" ? [thread] : [];
  });
  return found.filter((thread): thread is RawThread => matches(RawThread, thread));
}

// The latest thread, plus one with a pending request and one with background tasks: they fill the most fields.
function pickThreads(threads: RawThread[]): string[] {
  const latest = [...threads].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const picks = [latest[0], latest.find((thread) => thread.pendingRuntimeRequest), latest.find((thread) => (thread.pendingBackgroundTasks?.length ?? 0) > 0)];
  return [...new Set(picks.flatMap((thread) => (thread ? [thread.id] : [])))].slice(0, MAX_PROJECTIONS);
}
