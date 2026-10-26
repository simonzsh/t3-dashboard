import index from "../../../web/index.html";
import type { DashboardProvider } from "../../../shared/api.ts";
import { createActions } from "../../domain/actions.ts";
import { LinearBoard } from "../../domain/linearBoard.ts";
import { LiveSync } from "../../domain/liveSync.ts";
import { NO_MODEL_DEFAULTS } from "../../domain/providers.ts";
import { createSettings } from "../../domain/settings.ts";
import { ShellStore } from "../../domain/shellStore.ts";
import { UpdateManager } from "../../domain/updates.ts";
import { LinearClient } from "../../integrations/linear/client.ts";
import { createDashboardServer } from "../../server/server.ts";
import { siteFromBundle } from "../../server/site.ts";
import { SseHub } from "../../server/sse.ts";
import { readLinearKey } from "../../config/linearFile.ts";
import { VERSION } from "../../config/version.ts";
import { DEMO_ENVIRONMENT_ID, demoAutomations } from "./fixtures.ts";
import { DemoPort, demoLinearFetch } from "./port.ts";

const DEMO_PORT = 3001;
const RECLASSIFY_MS = 60_000;

/** The real dashboard on invented data: no T3, Linear, GitHub or config file is touched. */
export async function startDemo(env: Record<string, string | undefined>): Promise<void> {
  const port = new DemoPort(() => new Date());
  const hub = new SseHub();
  let providers: DashboardProvider[] = [];
  let modelDefaults = NO_MODEL_DEFAULTS;
  const store: ShellStore = new ShellStore({
    now: () => new Date(),
    onState: () => hub.broadcast({ type: "state", data: getState() }),
    onThreads: (diff) => hub.broadcast({ type: "threads", data: diff }),
    onProjects: (diff) => hub.broadcast({ type: "projects", data: diff }),
  });
  const auth = { current: () => "demo", setup: () => null, refresh: async () => {} };
  const live = new LiveSync({
    port,
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
  const getState = () => store.state(live.connection(), providers, true, DEMO_ENVIRONMENT_ID, modelDefaults);

  // The Linear key lives in memory, so the settings tab can connect and disconnect.
  const files = new Map([["linear.json", JSON.stringify({ apiKey: "lin_api_demo0000" })]]);
  const readFile = (path: string) => files.get(path) ?? "";
  const board = new LinearBoard({ client: new LinearClient(demoLinearFetch(new Date())), readKey: () => readLinearKey("linear.json", readFile), now: () => new Date() });
  const settings = createSettings({ file: "linear.json", readFile, writeSecret: (path, text) => void files.set(path, text), board });

  const updates = new UpdateManager({
    version: VERSION,
    unavailable: "Demo mode: updates are off.",
    latestTag: () => Promise.reject(new Error("Demo mode")),
    run: async () => false,
  });
  const setup = { refresh: async () => {}, paste: async () => "ok" as const, wake: () => live.retryNow() };
  const site = siteFromBundle(index);
  const handler = createDashboardServer({
    actions: createActions({ port, store, board }),
    hub,
    board,
    automations: () => demoAutomations(new Date()),
    getState,
    connection: () => live.connection(),
    site,
    settings,
    setup,
    updates,
  });

  const reclassifier = setInterval(() => store.reclassify(new Date()), RECLASSIFY_MS);
  live.start();
  const requested = Number(env.PORT);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number.isInteger(requested) && requested > 0 ? requested : DEMO_PORT,
    fetch: handler.fetch,
    routes: site.devRoutes,
    development: site.devRoutes !== undefined,
  } as never);
  console.log(`Demo dashboard: http://127.0.0.1:${server.port}`);

  const shutdown = () => {
    clearInterval(reclassifier);
    live.stop();
    hub.close();
    void server.stop(true).then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
