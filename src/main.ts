import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { loadConfig, resolveOrigin } from "./config.ts";
import { LiveSync } from "./live.ts";
import { LinearBoard } from "./linear.ts";
import { linearFile, readLinearWorkspaces } from "./linearConfig.ts";
import { createDashboardServer } from "./server.ts";
import { ShellStore } from "./shellStore.ts";
import { SseHub } from "./sse.ts";
import { T3Client } from "./t3/client.ts";
import type { DashboardProvider } from "../shared/api.ts";

const RECLASSIFY_MS = 60_000;
const readText = (path: string) => readFileSync(path, "utf8");

const config = loadConfig(process.env, readText, homedir());
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

const linearPath = linearFile(process.env, homedir());
const board = new LinearBoard({
  fetch: (url, init) => fetch(url, init),
  readWorkspaces: () => readLinearWorkspaces(linearPath, readText),
  resolveProject: (t3Project) => store.project(t3Project)?.id ?? null,
  now: () => new Date(),
});

const server = createDashboardServer({
  port: client,
  store,
  hub,
  board,
  getState,
  connection: () => live.connection(),
  staticDir: new URL("../web/dist/", import.meta.url),
});

const reclassifier = setInterval(() => store.reclassify(new Date()), RECLASSIFY_MS);
live.start();
server.listen(config.port, "127.0.0.1", () => console.log(`http://127.0.0.1:${config.port}`));

function shutdown(): void {
  clearInterval(reclassifier);
  live.stop();
  hub.close();
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
