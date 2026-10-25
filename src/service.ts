import { join } from "node:path";
import { logFile, type Platform } from "./paths.ts";

export interface Command {
  command: string;
  args: string[];
  ignoreError?: boolean;
  /** Commands to run instead when this one fails. */
  onFail?: Command[];
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
Environment=${quote(`PATH=${withLocalBin(path, home, ":")}`)}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
  const ctl = (...args: string[]) => cmd("systemctl", ["--user", ...args]);
  const name = `${LABEL}.service`;
  return {
    files: [{ path: unit, content }],
    install: [ctl("daemon-reload"), ctl("enable", "--now", name)],
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
    <key>PATH</key>
${item(withLocalBin(path, home, ":"))}
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
    install: [bootout, cmd("launchctl", ["bootstrap", `gui/${uid}`, plist])],
    uninstall: [bootout, { remove: plist }],
    restart: [cmd("launchctl", ["kickstart", "-k", target])],
  };
}

function windows({ exe, port, home, env }: PlanInput): Plan {
  const log = logFile(env, home, "win32");
  const tr = `powershell.exe -NoProfile -WindowStyle Hidden -Command "& '${ps(exe)}' start --port ${port} --log '${ps(log)}'"`;
  // Used when the task cannot be created (no rights, or a /TR over 261 characters).
  const fallback = [
    cmd("reg.exe", ["add", RUN_KEY, "/v", WIN_TASK, "/t", "REG_SZ", "/d", tr, "/f"]),
    cmd("powershell.exe", [
      "-NoProfile", "-WindowStyle", "Hidden", "-Command",
      `Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList '-NoProfile -WindowStyle Hidden -Command "& ''${ps(ps(exe))}'' start --port ${port} --log ''${ps(ps(log))}''"'`,
    ]),
  ];
  const tn = ["/TN", WIN_TASK];
  return {
    files: [],
    install: [
      { ...cmd("schtasks", ["/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", ...tn, "/TR", tr]), onFail: fallback },
      // Ignored: after the fallback this task does not exist, and the process already runs.
      cmd("schtasks", ["/Run", ...tn], true),
    ],
    uninstall: [cmd("schtasks", ["/End", ...tn], true), cmd("schtasks", ["/Delete", "/F", ...tn], true), cmd("reg.exe", ["delete", RUN_KEY, "/v", WIN_TASK, "/f"], true)],
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
  writeFile(path: string, content: string): void;
  rm(path: string): void;
}

const runCommand = async (step: Command, deps: ApplyDeps): Promise<void> => {
  const code = await deps.run(step.command, step.args);
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

