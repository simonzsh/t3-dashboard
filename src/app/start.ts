import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, lstatSync, unlinkSync } from "node:fs";
import { lstat, readdir, rm, statfs } from "node:fs/promises";
import os, { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import index from "../../web/index.html";
import type { DashboardProvider } from "../../shared/api.ts";
import { createActions } from "../domain/actions.ts";
import { AutomationGuard } from "../domain/automationGuard.ts";
import { createAutomations } from "../domain/automations.ts";
import { PullRequests } from "../domain/pulls.ts";
import { createNews } from "../domain/news.ts";
import { TokenManager } from "../domain/tokenManager.ts";
import { envAllowedHosts, envPort } from "../config/config.ts";
import { ghRunner } from "../integrations/github/gh.ts";
import { latestTag } from "../integrations/github/releases.ts";
import { LinearClient } from "../integrations/linear/client.ts";
import { findT3, runCommand } from "../integrations/t3/cli.ts";
import { T3Client, validateWith } from "../integrations/t3/client.ts";
import { environmentIdFile, readEnvironmentId, readServerVersion, resolveOrigin, runtimeFile } from "../integrations/t3/runtime.ts";
import { LiveSync } from "../domain/liveSync.ts";
import { LinearBoard } from "../domain/linearBoard.ts";
import { createProviderLimits } from "../domain/providerLimits.ts";
import { createCacheCleanup } from "../domain/cacheCleanup.ts";
import { createServerStats, vmStatAvailable } from "../domain/serverStats.ts";
import { createAgentSetup } from "../domain/agentSetup.ts";
import { createMcpStatus } from "../domain/mcpStatus.ts";
import { claudeMcpList, findClaude } from "../integrations/mcp/claudeCli.ts";
import { probeMcpHttp } from "../integrations/mcp/probe.ts";
import { nodeSetupFs } from "../config/agentSetupFs.ts";
import { createUsage } from "../domain/usage.ts";
import { readSessions, sessionsText } from "../config/sessionsFile.ts";
import { readStash, stashText } from "../config/stashFile.ts";
import { readSeen, seenText } from "../config/seenFile.ts";
import { syncAgentRules } from "../config/agentRules.ts";
import { readLinearKey } from "../config/linearFile.ts";
import { readRearmed, rearmedText } from "../config/rearmedFile.ts";
import { automationRunsText, readAutomationRuns } from "../config/automationRunsFile.ts";
import { AutomationRunLog } from "../domain/automationRuns.ts";
import { RearmedStore } from "../domain/rearmedStore.ts";
import { readAutomationThreads } from "../config/automationThreads.ts";
import { automationRunsFile, automationThreadsFile, linearFile, newsDir, newsFile, pidFile, rearmedFile, seenFile as seenPath, sessionsFile as sessionsPath, stashFile as stashPath } from "../config/paths.ts";
import { redirectConsole, writePidFile } from "../config/runFiles.ts";
import { writeSecret } from "../config/secretFile.ts";
import { createDashboardServer } from "../server/server.ts";
import { SessionsStore } from "../domain/sessionsStore.ts";
import { StashStore } from "../domain/stashStore.ts";
import { SeenStore } from "../domain/seenStore.ts";
import { createSettings } from "../domain/settings.ts";
import { ShellStore } from "../domain/shellStore.ts";
import { NO_MODEL_DEFAULTS } from "../domain/providers.ts";
import { siteFromBundle } from "../server/site.ts";
import { SseHub } from "../server/sse.ts";
import { installDeps, updateDeps } from "./deps.ts";
import { update } from "../cli/selfUpdate.ts";
import { UpdateManager } from "../domain/updates.ts";
import { VERSION } from "../config/version.ts";

const RECLASSIFY_MS = 60_000;
const NEWS_SWEEP_MS = 60_000;
const LISTEN_RETRY_MS = 5_000;
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 5_000;
const readText = (path: string) => readFileSync(path, "utf8");

// lstat, not stat: a symlink in the news folder is not an article.
function readHead(path: string, maxBytes?: number): string {
  if (maxBytes === undefined) return readText(path);
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    return buffer.toString("utf8", 0, readSync(fd, buffer, 0, maxBytes, 0));
  } finally {
    closeSync(fd);
  }
}

function listFolder(dir: string) {
  return readdirSync(dir).flatMap((name) => {
    try {
      const entry = lstatSync(join(dir, name));
      return [{ name, mtimeMs: entry.mtimeMs, isFile: entry.isFile() }];
    } catch {
      return [];
    }
  });
}

// A restart can race the old process for the port: retry for a few seconds.
async function listen(options: Parameters<typeof Bun.serve>[0] & { port: number }): Promise<Bun.Server<undefined>> {
  const deadline = Date.now() + LISTEN_RETRY_MS;
  for (;;) {
    try {
      return Bun.serve(options as never);
    } catch (error) {
      if ((error as { code?: string }).code !== "EADDRINUSE" || Date.now() > deadline) throw error;
      await sleep(200);
    }
  }
}

export interface StartOptions {
  /** Beats the PORT variable. */
  port?: number;
  /** Appends the console output to this file. */
  log?: string;
  env: Record<string, string | undefined>;
}

export async function start({ port, log, env }: StartOptions): Promise<void> {
  if (log) redirectConsole(log);
  const home = homedir();
  const runtime = runtimeFile(env, home);
  const environmentId = environmentIdFile(env, home);
  const origin = () => resolveOrigin(runtime, readText);
  const auth = new TokenManager({
    env,
    homedir: home,
    readFile: readText,
    writeSecret,
    findT3: () => findT3(env, home, readServerVersion(runtime, readText)),
    run: runCommand,
    validate: validateWith(origin),
    log: (message) => console.log(message),
  });
  // Starts without a token: the setup screen explains what is missing.
  await auth.refresh();
  const client = new T3Client({ origin: async () => origin(), token: () => auth.current() });

  const hub = new SseHub();
  let providers: DashboardProvider[] = [];
  let modelDefaults = NO_MODEL_DEFAULTS;
  const store: ShellStore = new ShellStore({
    now: () => new Date(),
    onState: () => hub.broadcast({ type: "state", data: getState() }),
    onThreads: (diff) => hub.broadcast({ type: "threads", data: diff }),
    onProjects: (diff) => hub.broadcast({ type: "projects", data: diff }),
  });
  const live = new LiveSync({
    port: client,
    store,
    auth,
    onConnection: (status) => hub.broadcast({ type: "connection", data: status }),
    onProviders: (list) => {
      providers = list;
      hub.broadcast({ type: "providers", data: list });
    },
    onModelDefaults: (defaults) => {
      modelDefaults = defaults;
      hub.broadcast({ type: "modelDefaults", data: defaults });
    },
  });
  const rearmedPath = rearmedFile(env, home);
  const rearmed = new RearmedStore(readRearmed(rearmedPath, readText), (marks) => writeSecret(rearmedPath, rearmedText(marks)));
  const guard = new AutomationGuard({ port: client, rearmed });
  const getState = () => store.state(live.connection(), providers, readEnvironmentId(environmentId, readText), modelDefaults);

  const linearPath = linearFile(env, home);
  const board = new LinearBoard({
    client: new LinearClient((url, init) => fetch(url, init)),
    readKey: () => readLinearKey(linearPath, readText),
    now: () => new Date(),
  });

  const usage = createUsage({ port: client, threads: () => getState().threads, now: () => new Date() });
  const limits = createProviderLimits({ port: client, now: () => new Date() });
  const serverStats = createServerStats({ os, statfs, diskPath: homedir(), now: () => new Date(), sleep, availableMemory: os.platform() === "darwin" ? darwinAvailableMemory : undefined });
  const agentSetup = createAgentSetup({ fs: nodeSetupFs(), env, home, platform: os.platform(), projects: () => getState().projects, now: () => new Date() });
  const claudeBin = findClaude(home, existsSync, (name) => Bun.which(name));
  const mcpStatus = createMcpStatus({
    inventory: agentSetup,
    probe: (url) => probeMcpHttp(url, { fetch: (target, init) => fetch(target, init) }),
    claudeList: claudeBin === null ? null : () => claudeMcpList(runCommand, claudeBin),
    now: () => new Date(),
  });
  const cacheCleanup = createCacheCleanup({
    fs: { readdir: (path) => readdir(path), lstat: (path) => lstat(path), rm: (path, options) => rm(path, options) },
    homedir,
    tmpdir,
    platform: os.platform(),
    now: () => new Date(),
  });

  const settings = createSettings({ file: linearPath, readFile: readText, writeSecret, board });
  const wake = () => {
    live.retryNow();
    guard.retryNow();
  };
  const setup = { refresh: () => auth.refresh(), paste: (token: string) => auth.paste(token), wake };

  const site = siteFromBundle(index);
  const repo = updateDeps(env).repo;
  const timedFetch = ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS) })) as typeof fetch;
  const updates = new UpdateManager({
    version: VERSION,
    unavailable: VERSION === "dev" ? "Development build: updates come from releases." : !Bun.isStandaloneExecutable ? "Not running the compiled binary." : null,
    latestTag: () => latestTag(timedFetch, repo),
    run: async () => {
      const deps = updateDeps(env);
      const service = await deps.serviceInstalled();
      const installed = await update({ check: false }, deps);
      // Started by hand: no service restarts the new binary, so this process does it.
      if (installed && !service) {
        Bun.spawn([deps.exe, ...Bun.argv.slice(2)], { detached: true, stdio: ["ignore", "ignore", "ignore"] }).unref();
        shutdown();
      }
      return installed;
    },
  });
  const actions = createActions({ port: client, store, board });
  const threadsFile = automationThreadsFile(env, home);
  const runsPath = automationRunsFile(env, home);
  const automations = createAutomations({
    port: client,
    store,
    dedicated: { read: () => readAutomationThreads(threadsFile, readText) },
    rearmed,
    runs: new AutomationRunLog(readAutomationRuns(runsPath, readText), (log) => writeSecret(runsPath, automationRunsText(log))),
  });
  const news = createNews({
    port: client,
    store,
    file: newsFile(env, home),
    dir: newsDir(env, home),
    readFile: readText,
    writeSecret,
    fs: {
      list: listFolder,
      read: readHead,
      mkdir: (dir) => void mkdirSync(dir, { recursive: true, mode: 0o700 }),
      remove: unlinkSync,
    },
  });
  const pulls = new PullRequests({ run: ghRunner(env, home), now: () => new Date() });
  const sessionsFile = sessionsPath(env, home);
  const sessions = new SessionsStore(readSessions(sessionsFile, readText), (value) => writeSecret(sessionsFile, sessionsText(value)));
  const stashFile = stashPath(env, home);
  const stash = new StashStore(readStash(stashFile, readText), (entries) => writeSecret(stashFile, stashText(entries)), { now: () => new Date(), newId: () => crypto.randomUUID() });
  const seenFile = seenPath(env, home);
  const seen = new SeenStore(readSeen(seenFile, readText), (value) => writeSecret(seenFile, seenText(value)));
  const handler = createDashboardServer({ actions, sessions, stash, seen, hub, board, usage, limits, serverStats, agentSetup, mcpStatus, cacheCleanup, automations, pulls, news, getState, connection: () => live.connection(), site, settings, setup, updates, allowedHosts: envAllowedHosts(env) });

  const reclassifier = setInterval(() => store.reclassify(new Date()), RECLASSIFY_MS);
  // It only touches the run threads of its own task, so it runs in dev builds too.
  const sweeper = setInterval(() => void news.sweep(), NEWS_SWEEP_MS);
  // A dev build has no version to compare, and its runs must not call GitHub.
  const checker = VERSION === "dev" ? undefined : setInterval(() => void updates.check(), UPDATE_CHECK_MS);
  if (checker) void updates.check();
  // The compiled binary refreshes the rules at each start, so a self-update brings the new text.
  // A dev server must not change the user's real tasks or files, unless asked for a test.
  const managed = VERSION !== "dev" && Bun.isStandaloneExecutable;
  if (managed) syncAgentRules("write", installDeps(env));
  live.start();
  if (managed || env.T3_DASHBOARD_AUTOMATION_GUARD === "on") guard.start();
  const server = await listen({
    hostname: "127.0.0.1",
    port: port ?? envPort(env),
    fetch: handler.fetch,
    routes: site.devRoutes,
    development: site.devRoutes !== undefined,
  });
  console.log(`http://127.0.0.1:${server.port}`);
  const removePidFile = writePidFile(pidFile(env, home, process.platform), process.pid);
  process.on("exit", removePidFile);

  const shutdown = () => {
    clearInterval(reclassifier);
    clearInterval(checker);
    clearInterval(sweeper);
    live.stop();
    guard.stop();
    hub.close();
    client.close();
    void server.stop(true).then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function darwinAvailableMemory(): Promise<number | null> {
  const proc = Bun.spawn(["vm_stat"], { stdout: "pipe", stderr: "ignore" });
  const [code, text] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  return code === 0 ? vmStatAvailable(text) : null;
}
