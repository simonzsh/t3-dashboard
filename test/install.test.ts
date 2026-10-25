import assert from "node:assert/strict";
import { test } from "bun:test";
import { install, serviceInstalled, servicePort, uninstall, waitForService, type InstallDeps } from "../src/install.ts";

function harness(options: { platform?: string; healthyAfter?: number; answerVersion?: string | null; hasSystemctl?: boolean; pid?: string | null; files?: string[] } = {}) {
  const calls: string[] = [];
  let clock = 0;
  let probes = 0;
  const platform = (options.platform ?? "linux") as NodeJS.Platform;
  const deps: InstallDeps = {
    platform,
    exe: "/bin/t3-dashboard",
    home: platform === "win32" ? "C:\\u" : "/home/ann",
    uid: 1000,
    env: platform === "win32" ? { LOCALAPPDATA: "C:\\u\\l" } : {},
    path: "/usr/bin",
    run: async (command, args) => (calls.push(`${command} ${args.join(" ")}`), 0),
    writeFile: (path) => void calls.push(`write ${path}`),
    rm: (path) => void calls.push(`rm ${path}`),
    mkdir: (path) => void calls.push(`mkdir ${path}`),
    exists: (path) => (options.files ?? []).includes(path),
    readFile: () => {
      if (options.pid == null) throw new Error("ENOENT");
      return options.pid;
    },
    hasCommand: () => options.hasSystemctl ?? true,
    version: "1.0.0",
    probeHealth: async (url) => {
      calls.push(`health ${url}`);
      if (++probes <= (options.healthyAfter ?? 0)) return null;
      return { version: options.answerVersion === undefined ? "1.0.0" : options.answerVersion };
    },
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
    open: async (url) => void calls.push(`open ${url}`),
    log: (message) => void calls.push(`log ${message}`),
  };
  return { deps, calls };
}

test("install writes the service, starts it, waits for the health check, then opens the browser", async () => {
  const { deps, calls } = harness({ healthyAfter: 2 });
  await install({ port: 4500, open: true }, deps);
  assert.deepEqual(calls.filter((c) => !c.startsWith("log")), [
    "mkdir /home/ann/.local/state/t3-dashboard",
    "write /home/ann/.config/systemd/user/t3-dashboard.service",
    "systemctl --user daemon-reload",
    "systemctl --user enable t3-dashboard.service",
    "systemctl --user restart t3-dashboard.service",
    "health http://127.0.0.1:4500/api/health",
    "health http://127.0.0.1:4500/api/health",
    "health http://127.0.0.1:4500/api/health",
    "open http://127.0.0.1:4500",
  ]);
});

test("--no-open prints the address and opens nothing", async () => {
  const { deps, calls } = harness();
  await install({ port: 4310, open: false }, deps);
  assert.equal(calls.some((c) => c.startsWith("open")), false);
  assert.ok(calls.includes("log Dashboard ready: http://127.0.0.1:4310"));
});

test("a failing browser launch does not fail the install", async () => {
  const { deps, calls } = harness();
  deps.open = async () => {
    throw new Error("no browser");
  };
  await install({ port: 4310, open: true }, deps);
  assert.ok(calls.includes("log Dashboard ready: http://127.0.0.1:4310"));
});

test("a service that never answers fails after 15 s and points to the logs", async () => {
  const { deps } = harness({ healthyAfter: Infinity });
  await assert.rejects(install({ port: 4310, open: true }, deps), /did not answer.*journalctl --user -u t3-dashboard/s);
});

test("on macOS the log hint is the log file", async () => {
  const { deps } = harness({ platform: "darwin", healthyAfter: Infinity });
  await assert.rejects(install({ port: 4310, open: true }, deps), /Library\/Logs\/t3-dashboard\/dashboard\.log/);
});

test("linux without systemctl points to t3-dashboard start", async () => {
  const { deps, calls } = harness({ hasSystemctl: false });
  await assert.rejects(install({ port: 4310, open: true }, deps), /systemctl.*t3-dashboard start/s);
  assert.equal(calls.some((c) => c.startsWith("write")), false);
});

test("uninstall removes the unit and keeps the config", async () => {
  const { deps, calls } = harness();
  await uninstall(deps);
  assert.deepEqual(calls.filter((c) => !c.startsWith("log")), [
    "systemctl --user disable --now t3-dashboard.service",
    "rm /home/ann/.config/systemd/user/t3-dashboard.service",
    "systemctl --user daemon-reload",
  ]);
});

test("windows uninstall also kills the process of the pid file", async () => {
  const { deps, calls } = harness({ platform: "win32", pid: "4242\n" });
  await uninstall(deps);
  assert.ok(calls.some((c) => c.startsWith("taskkill /FI PID eq 4242 /FI IMAGENAME eq ")));
});

test("windows uninstall without a pid file still succeeds", async () => {
  const { deps, calls } = harness({ platform: "win32", pid: null });
  await uninstall(deps);
  assert.equal(calls.some((c) => c.startsWith("taskkill")), false);
});

test("serviceInstalled looks for the unit file, or probes the task on Windows", async () => {
  const unit = "/home/ann/.config/systemd/user/t3-dashboard.service";
  assert.equal(await serviceInstalled(harness({ files: [unit] }).deps), true);
  assert.equal(await serviceInstalled(harness().deps), false);
  assert.equal(await serviceInstalled(harness({ platform: "win32" }).deps), true);
});

test("another version on the port fails with a port conflict message", async () => {
  for (const answerVersion of ["0.9.0", null]) {
    const { deps, calls } = harness({ answerVersion });
    await assert.rejects(install({ port: 4310, open: true }, deps), /Port 4310 is used by another program or an older dashboard\. Stop it, or install with --port <n>\./);
    assert.equal(calls.some((c) => c.startsWith("open") || c.startsWith("log Dashboard ready")), false);
  }
});

test("an old dashboard that answers before the restart does not fail the install", async () => {
  const { deps } = harness();
  let probes = 0;
  deps.probeHealth = async () => ({ version: ++probes < 3 ? "0.9.0" : "1.0.0" });
  await install({ port: 4310, open: false }, deps);
  assert.equal(probes, 3);
});

test("waitForService waits for the given version", async () => {
  const { deps } = harness({ answerVersion: "2.0.0" });
  assert.equal(await waitForService(4310, deps, "2.0.0"), "http://127.0.0.1:4310");
  await assert.rejects(waitForService(4310, deps), /another program or an older dashboard/);
});

test("servicePort reads the port of the unit file, else the fallback", () => {
  const { deps } = harness();
  deps.readFile = () => 'ExecStart="/bin/t3-dashboard" start --port 4777\n';
  assert.equal(servicePort(deps, 4310), 4777);
  deps.readFile = () => {
    throw new Error("ENOENT");
  };
  assert.equal(servicePort(deps, 4310), 4310);
});

test("servicePort reads the port of the Windows launcher", async () => {
  const { deps } = harness({ platform: "win32" });
  const written: Record<string, string> = {};
  deps.writeFile = (path, content) => void (written[path] = content);
  deps.readFile = (path) => written[path] ?? "";
  await install({ port: 5000, open: false }, deps);
  assert.equal(servicePort(deps, 4310), 5000);
});
