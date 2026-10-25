import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import index from "../web/index.html";
import type { DashboardProvider } from "../shared/api.ts";
import { readAutomations } from "./automations.ts";
import { TokenManager, findT3, runCommand, validateWith } from "./auth.ts";
import { agentConfigDir, loadBrains } from "./brains.ts";
import { loadConfig, resolveOrigin } from "./config.ts";
import { LiveSync } from "./live.ts";
import { LinearBoard } from "./linear.ts";
import { readLinearWorkspaces } from "./linearConfig.ts";
import { configDir, linearFile, pidFile } from "./paths.ts";
import { redirectConsole, writePidFile } from "./runFiles.ts";
import { writeSecret } from "./secretFile.ts";
import { createDashboardServer } from "./server.ts";
import { createSettings } from "./settings.ts";
import { ShellStore } from "./shellStore.ts";
import { siteFromBundle } from "./site.ts";
import { SseHub } from "./sse.ts";
import { T3Client } from "./t3/client.ts";

const RECLASSIFY_MS = 60_000;
const LISTEN_RETRY_MS = 5_000;
const readText = (path: string) => readFileSync(path, "utf8");

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
  const config = loadConfig(env, home);
  const origin = () => resolveOrigin(config.runtimeFile, readText);
  const auth = new TokenManager({
    env,
    homedir: home,
    readFile: readText,
    writeSecret,
    findT3: () => findT3(env, home),
    run: runCommand,
    validate: validateWith(origin),
    log: (message) => console.log(message),
  });
  // Starts without a token: the setup screen explains what is missing.
  await auth.refresh();
  const client = new T3Client({ origin: async () => origin(), token: () => auth.current() });

  const hub = new SseHub();
  let providers: DashboardProvider[] = [];
  const store: ShellStore = new ShellStore({
    now: () => new Date(),
    onState: () => hub.broadcast({ type: "state", data: getState() }),
    onThreads: (diff) => hub.broadcast({ type: "threads", data: diff }),
    onProjects: (diff) => hub.broadcast({ type: "projects", data: diff }),
  });
  const live = new LiveSync({
    port: client,
    store,
    origin,
    auth,
    onConnection: (status) => hub.broadcast({ type: "connection", data: status }),
    onProviders: (list) => {
      providers = list;
      hub.broadcast({ type: "providers", data: list });
    },
  });
  const brainsDir = agentConfigDir(env, home);
  const getState = () => store.state(live.connection(), providers, loadBrains(brainsDir).length > 0);

  const linearPath = linearFile(env, home);
  const board = new LinearBoard({
    fetch: (url, init) => fetch(url, init),
    readWorkspaces: () => readLinearWorkspaces(linearPath, readText),
    resolveProject: (t3Project) => store.project(t3Project)?.id ?? null,
    now: () => new Date(),
  });

  const automations = () => readAutomations({ configDir: brainsDir, now: () => new Date(), projectTitle: (id) => store.project(id)?.title || null });

  const settings = createSettings({ file: linearPath, configDir: configDir(env, home), readFile: readText, writeSecret, board, tokenSource: () => auth.source() });
  const setup = { refresh: () => auth.refresh(), paste: (token: string) => auth.paste(token), wake: () => live.retryNow() };

  const site = siteFromBundle(index);
  const handler = createDashboardServer({ port: client, store, hub, board, automations, getState, connection: () => live.connection(), site, settings, setup });

  const reclassifier = setInterval(() => store.reclassify(new Date()), RECLASSIFY_MS);
  live.start();
  const server = await listen({
    hostname: "127.0.0.1",
    port: port ?? config.port,
    fetch: handler.fetch,
    routes: site.devRoutes,
    development: site.devRoutes !== undefined,
  });
  console.log(`http://127.0.0.1:${server.port}`);
  const removePidFile = writePidFile(pidFile(env, home, process.platform), process.pid);
  process.on("exit", removePidFile);

  const shutdown = () => {
    clearInterval(reclassifier);
    live.stop();
    hub.close();
    void server.stop(true).then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
