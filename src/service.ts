import { join, win32 } from "node:path";
import { logFile, stateDir, type Platform } from "./paths.ts";

export interface Command {
  command: string;
  args: string[];
  ignoreError?: boolean;
  /** Commands to run instead when this one fails. */
  onFail?: Command[];
  /** Runs the command again after a failure, `times` attempts in all. */
  retry?: { times: number; delayMs: number };
}
export type Step = Command | { remove: string };
export interface Plan {
  files: { path: string; content: string }[];
  install: Command[];
  uninstall: Step[];
  restart: Command[];
  /** Set when there is no file to look for: a zero exit code means installed. */
  probe?: Command;
}
export interface PlanInput {
  exe: string;
  port: number;
  /** PATH at install time: a service starts with a short one. */
  path: string;
  uid: number;
  home: string;
  env: Record<string, string | undefined>;
}

/** Overrides copied from the install-time env into the service: it starts with a bare one. */
export const SERVICE_ENV_KEYS = [
  "T3_DASHBOARD_TOKEN_FILE",
  "T3_DASHBOARD_CONFIG_DIR",
  "T3_DASHBOARD_LINEAR_FILE",
  "T3_DASHBOARD_AGENT_CONFIG_DIR",
  "T3_DASHBOARD_T3_BIN",
  "T3_SERVER_RUNTIME",
  "T3CODE_HOME",
] as const;

const serviceEnv = (env: PlanInput["env"]): [string, string][] =>
  SERVICE_ENV_KEYS.flatMap((key): [string, string][] => (env[key] ? [[key, env[key]!]] : []));

const LABEL = "t3-dashboard";
const WIN_TASK = "T3 Dashboard";
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

const cmd = (command: string, args: string[], ignoreError = false): Command => ({ command, args, ...(ignoreError ? { ignoreError } : {}) });
const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const ps = (text: string) => text.replaceAll("'", "''");

const withLocalBin = (path: string, home: string, sep: string): string => {
  const bin = join(home, ".local", "bin");
  return path.split(sep).includes(bin) ? path : [path, bin].filter(Boolean).join(sep);
};

function linux({ exe, port, path, home, env }: PlanInput): Plan {
  const unit = join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "systemd", "user", `${LABEL}.service`);
  // systemd expands %-specifiers and parses quotes in these values.
  const quote = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
  const content = `[Unit]
Description=T3 Dashboard
After=network.target

[Service]
ExecStart=${quote(exe)} start --port ${port}
${[["PATH", withLocalBin(path, home, ":")] as [string, string], ...serviceEnv(env)].map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`).join("\n")}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
  const ctl = (...args: string[]) => cmd("systemctl", ["--user", ...args]);
  const name = `${LABEL}.service`;
  return {
    files: [{ path: unit, content }],
    // restart, not enable --now: a reinstall must load the new binary.
    install: [ctl("daemon-reload"), ctl("enable", name), ctl("restart", name)],
    uninstall: [{ ...ctl("disable", "--now", name), ignoreError: true }, { remove: unit }, { ...ctl("daemon-reload"), ignoreError: true }],
    restart: [ctl("restart", name)],
  };
}

function darwin({ exe, port, path, uid, home, env }: PlanInput): Plan {
  const plist = join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
  const log = xml(logFile(env, home, "darwin"));
  const item = (text: string) => `    <string>${xml(text)}</string>`;
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${[exe, "start", "--port", String(port)].map(item).join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
${[["PATH", withLocalBin(path, home, ":")] as [string, string], ...serviceEnv(env)].map(([key, value]) => `    <key>${key}</key>\n${item(value)}`).join("\n")}
  </dict>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
  const target = `gui/${uid}/${LABEL}`;
  const bootout = cmd("launchctl", ["bootout", target], true);
  return {
    files: [{ path: plist, content }],
    // bootout returns before the job is gone: bootstrap fails until then.
    install: [bootout, { ...cmd("launchctl", ["bootstrap", `gui/${uid}`, plist]), retry: { times: 5, delayMs: 1000 } }],
    uninstall: [bootout, { remove: plist }],
    restart: [cmd("launchctl", ["kickstart", "-k", target])],
  };
}

function windows({ exe, port, home, env }: PlanInput): Plan {
  const log = logFile(env, home, "win32");
  // A launcher file keeps /TR short: schtasks refuses over 261 characters, the Run key over 260.
  const launcher = win32.join(stateDir(env, home, "win32"), "start.ps1");
  // The BOM lets PowerShell 5.1 read a non-ASCII user name as UTF-8.
  const content = `\uFEFF${serviceEnv(env).map(([key, value]) => `$env:${key} = '${ps(value)}'\r\n`).join("")}& '${ps(exe)}' start --port ${port} --log '${ps(log)}'\r\n`;
  const flags = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass";
  const tr = `powershell.exe ${flags} -File "${launcher}"`;
  // Used when the task cannot be created (no rights).
  const fallback = [
    cmd("reg.exe", ["add", RUN_KEY, "/v", WIN_TASK, "/t", "REG_SZ", "/d", tr, "/f"]),
    cmd("powershell.exe", [
      "-NoProfile", "-WindowStyle", "Hidden", "-Command",
      `Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList '${flags} -File "${ps(launcher)}"'`,
    ]),
  ];
  const tn = ["/TN", WIN_TASK];
  return {
    files: [{ path: launcher, content }],
    install: [
      { ...cmd("schtasks", ["/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", ...tn, "/TR", tr]), onFail: fallback },
      // Ignored: after the fallback this task does not exist, and the process already runs.
      // /End first, so a reinstall restarts on the new binary.
      cmd("schtasks", ["/End", ...tn], true),
      cmd("schtasks", ["/Run", ...tn], true),
    ],
    uninstall: [cmd("schtasks", ["/End", ...tn], true), cmd("schtasks", ["/Delete", "/F", ...tn], true), cmd("reg.exe", ["delete", RUN_KEY, "/v", WIN_TASK, "/f"], true), { remove: launcher }],
    restart: [cmd("schtasks", ["/End", ...tn], true), cmd("schtasks", ["/Run", ...tn])],
    probe: cmd("schtasks", ["/Query", ...tn]),
  };
}

export function servicePlan(platform: Platform, input: PlanInput): Plan {
  if (platform === "darwin") return darwin(input);
  if (platform === "win32") return windows(input);
  return linux(input);
}

export interface ApplyDeps {
  /** Resolves with the exit code, or a non-zero value when the program did not start. */
  run(command: string, args: string[]): Promise<number>;
  sleep(ms: number): Promise<void>;
  writeFile(path: string, content: string): void;
  rm(path: string): void;
}

const runCommand = async (step: Command, deps: ApplyDeps): Promise<void> => {
  let code = await deps.run(step.command, step.args);
  for (let attempt = 1; code !== 0 && attempt < (step.retry?.times ?? 1); attempt++) {
    await deps.sleep(step.retry!.delayMs);
    code = await deps.run(step.command, step.args);
  }
  if (code === 0 || step.ignoreError) return;
  if (!step.onFail) throw new Error(`${step.command} failed (exit ${code})`);
  for (const next of step.onFail) await runCommand(next, deps);
};

/** Writes the plan files (install only), then runs its steps in order. */
export async function applyPlan(plan: Plan, action: "install" | "uninstall" | "restart", deps: ApplyDeps): Promise<void> {
  if (action === "install") for (const file of plan.files) deps.writeFile(file.path, file.content);
  for (const step of plan[action]) {
    if ("remove" in step) deps.rm(step.remove);
    else await runCommand(step, deps);
  }
}

