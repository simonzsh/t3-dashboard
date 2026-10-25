import { applyPlan, servicePlan, type ApplyDeps, type Plan } from "./service.ts";
import { configDir, logFile, pidFile, stateDir } from "./paths.ts";

const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 250;

export interface InstallDeps extends ApplyDeps {
  platform: NodeJS.Platform;
  exe: string;
  home: string;
  uid: number;
  env: Record<string, string | undefined>;
  path: string;
  mkdir(path: string): void;
  exists(path: string): boolean;
  readFile(path: string): string;
  hasCommand(name: string): boolean;
  /** The dashboard version of the answer (null when it has none), or null when nothing answers. */
  probeHealth(url: string): Promise<{ version: string | null } | null>;
  /** Version of this binary: the service must answer with it. */
  version: string;
  sleep(ms: number): Promise<void>;
  now(): number;
  open(url: string): Promise<void>;
  log(message: string): void;
}

const planFor = (deps: InstallDeps, port: number): Plan => servicePlan(deps.platform, { exe: deps.exe, port, path: deps.path, uid: deps.uid, home: deps.home, env: deps.env });

const logHint = (deps: InstallDeps): string =>
  deps.platform === "linux" ? "journalctl --user -u t3-dashboard" : logFile(deps.env, deps.home, deps.platform);

/** Waits until this binary's dashboard answers on the port. A different answer is a port conflict. */
export async function waitForService(port: number, deps: InstallDeps, version = deps.version): Promise<string> {
  const url = `http://127.0.0.1:${port}`;
  const deadline = deps.now() + HEALTH_TIMEOUT_MS;
  let foreign = false;
  for (;;) {
    const answer = await deps.probeHealth(`${url}/api/health`);
    if (answer?.version === version) return url;
    // An old dashboard can still answer while the restart is under way: judge at the deadline.
    foreign = answer !== null;
    if (deps.now() >= deadline) break;
    await deps.sleep(HEALTH_POLL_MS);
  }
  if (foreign) throw new Error(`Port ${port} is used by another program or an older dashboard. Stop it, or install with --port <n>.`);
  throw new Error(`The service did not answer on ${url} within 15 s. See the log: ${logHint(deps)}`);
}

export async function install({ port, open }: { port: number; open: boolean }, deps: InstallDeps): Promise<void> {
  if (deps.platform === "linux" && !deps.hasCommand("systemctl")) {
    throw new Error("systemctl not found, so no service can be installed. Run `t3-dashboard start` instead.");
  }
  // launchd and `start --log` do not create the folder of the log file.
  deps.mkdir(stateDir(deps.env, deps.home, deps.platform));
  await applyPlan(planFor(deps, port), "install", deps);

  const url = await waitForService(port, deps);
  deps.log(`Dashboard ready: ${url}`);
  if (!open) return;
  try {
    await deps.open(url);
  } catch {
    // The address is already printed.
  }
}

export async function uninstall(deps: InstallDeps): Promise<void> {
  await applyPlan(planFor(deps, 0), "uninstall", deps);
  if (deps.platform === "win32") {
    // The Run-key fallback has no task to end: stop the process by its pid.
    try {
      const pid = Number.parseInt(deps.readFile(pidFile(deps.env, deps.home, deps.platform)), 10);
      // The image filter keeps a reused pid of another program safe.
      const image = deps.exe.split(/[\\/]/).pop() ?? "t3-dashboard.exe";
      if (Number.isInteger(pid)) await deps.run("taskkill", ["/FI", `PID eq ${pid}`, "/FI", `IMAGENAME eq ${image}`, "/F"]);
    } catch {
      // No pid file: nothing is running.
    }
  }
  deps.log(`Service removed. The config stays in ${configDir(deps.env, deps.home)}.`);
}

/** True when the service is registered: its file exists, or on Windows its task answers. */
export async function serviceInstalled(deps: InstallDeps): Promise<boolean> {
  const plan = planFor(deps, 0);
  if (plan.probe) return (await deps.run(plan.probe.command, plan.probe.args)) === 0;
  return plan.files[0] ? deps.exists(plan.files[0].path) : false;
}

export const restartService = (deps: InstallDeps): Promise<void> => applyPlan(planFor(deps, 0), "restart", deps);

/** The port written in the service file (the launcher on Windows), or the fallback. */
export function servicePort(deps: InstallDeps, fallback: number): number {
  try {
    const file = planFor(deps, 0).files[0];
    return Number(/--port\D*(\d+)/.exec(file ? deps.readFile(file.path) : "")?.[1]) || fallback;
  } catch {
    return fallback;
  }
}
