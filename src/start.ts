import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import index from "../web/index.html";
import type { DashboardProvider } from "../shared/api.ts";
import { readAutomations } from "./automations.ts";
import { agentConfigDir } from "./brains.ts";
import { loadConfig, resolveOrigin } from "./config.ts";
import { LiveSync } from "./live.ts";
import { LinearBoard } from "./linear.ts";
import { linearFile, readLinearWorkspaces } from "./linearConfig.ts";
import { createDashboardServer } from "./server.ts";
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
  env: Record<string, string | undefined>;
}

export async function start({ port, env }: StartOptions): Promise<void> {
  const config = loadConfig(env, readText, homedir());
  const origin = () => resolveOrigin(config.runtimeFile, readText);
  const client = new T3Client({ origin: async () => origin(), token: config.readToken() });

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
    onConnection: (status) => hub.broadcast({ type: "connection", data: status }),
    onProviders: (list) => {
      providers = list;
      hub.broadcast({ type: "providers", data: list });
    },
  });
  const getState = () => store.state(live.connection(), providers);

  const linearPath = linearFile(env, homedir());
  const board = new LinearBoard({
    fetch: (url, init) => fetch(url, init),
    readWorkspaces: () => readLinearWorkspaces(linearPath, readText),
    resolveProject: (t3Project) => store.project(t3Project)?.id ?? null,
    now: () => new Date(),
  });

  const brainsDir = agentConfigDir(env, homedir());
  const automations = () => readAutomations({ configDir: brainsDir, now: () => new Date(), projectTitle: (id) => store.project(id)?.title || null });

  const site = siteFromBundle(index);
  const handler = createDashboardServer({ port: client, store, hub, board, automations, getState, connection: () => live.connection(), site });

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

  const shutdown = () => {
    clearInterval(reclassifier);
    live.stop();
    hub.close();
    void server.stop(true).then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
