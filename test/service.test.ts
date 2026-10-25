import assert from "node:assert/strict";
import { test } from "bun:test";
import { applyPlan, servicePlan, type Plan } from "../src/service.ts";

const base = { exe: "/opt/my apps/t3-dashboard", port: 4310, path: "/usr/bin:/bin", uid: 501, home: "/home/ann", env: {} };

test("linux: a systemd user unit with a quoted ExecStart and the PATH", () => {
  const plan = servicePlan("linux", base);
  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0]!.path, "/home/ann/.config/systemd/user/t3-dashboard.service");
  const unit = plan.files[0]!.content;
  assert.match(unit, /^ExecStart="\/opt\/my apps\/t3-dashboard" start --port 4310$/m);
  assert.match(unit, /^Environment="PATH=\/usr\/bin:\/bin:\/home\/ann\/\.local\/bin"$/m);
  assert.match(unit, /^Restart=on-failure$/m);
  assert.match(unit, /^RestartSec=3$/m);
  assert.match(unit, /^WantedBy=default\.target$/m);
  assert.deepEqual(plan.install.map((c) => c.args.join(" ")), ["--user daemon-reload", "--user enable t3-dashboard.service", "--user restart t3-dashboard.service"]);
  assert.deepEqual(plan.restart.map((c) => c.args.join(" ")), ["--user restart t3-dashboard.service"]);
});

test("linux: XDG_CONFIG_HOME moves the unit, and % is escaped", () => {
  const plan = servicePlan("linux", { ...base, exe: "/a%b/t3-dashboard", env: { XDG_CONFIG_HOME: "/x" } });
  assert.equal(plan.files[0]!.path, "/x/systemd/user/t3-dashboard.service");
  assert.match(plan.files[0]!.content, /ExecStart="\/a%%b\/t3-dashboard"/);
});

test("linux: uninstall disables, removes the unit, then reloads", () => {
  const steps = servicePlan("linux", base).uninstall.map((s) => ("remove" in s ? `rm ${s.remove}` : `${s.command} ${s.args.join(" ")}`));
  assert.deepEqual(steps, [
    "systemctl --user disable --now t3-dashboard.service",
    "rm /home/ann/.config/systemd/user/t3-dashboard.service",
    "systemctl --user daemon-reload",
  ]);
});

test("macos: a LaunchAgent that keeps the dashboard alive, with PATH and logs", () => {
  const plan = servicePlan("darwin", { ...base, exe: "/Users/a b/t3-dashboard", home: "/Users/ann" });
  const file = plan.files[0]!;
  assert.equal(file.path, "/Users/ann/Library/LaunchAgents/t3-dashboard.plist");
  assert.match(file.content, /<key>Label<\/key>\s*<string>t3-dashboard<\/string>/);
  assert.match(file.content, /<string>\/Users\/a b\/t3-dashboard<\/string>\s*<string>start<\/string>\s*<string>--port<\/string>\s*<string>4310<\/string>/);
  assert.match(file.content, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(file.content, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(file.content, /<key>PATH<\/key>\s*<string>\/usr\/bin:\/bin:\/Users\/ann\/\.local\/bin<\/string>/);
  const log = "/Users/ann/Library/Logs/t3-dashboard/dashboard.log";
  assert.match(file.content, new RegExp(`<key>StandardOutPath</key>\\s*<string>${log}</string>`));
  assert.match(file.content, new RegExp(`<key>StandardErrorPath</key>\\s*<string>${log}</string>`));
  assert.deepEqual(plan.install.map((c) => [c.command, c.args.join(" "), c.ignoreError ?? false]), [
    ["launchctl", "bootout gui/501/t3-dashboard", true],
    ["launchctl", "bootstrap gui/501 /Users/ann/Library/LaunchAgents/t3-dashboard.plist", false],
  ]);
  assert.deepEqual(plan.restart.map((c) => c.args.join(" ")), ["kickstart -k gui/501/t3-dashboard"]);
});

test("macos: XML characters in paths are escaped", () => {
  const plan = servicePlan("darwin", { ...base, exe: "/a&b/<t3>", home: "/Users/ann" });
  assert.match(plan.files[0]!.content, /<string>\/a&amp;b\/&lt;t3&gt;<\/string>/);
});

test("windows: a logon task that runs PowerShell, with a Run-key fallback", () => {
  const exe = "C:\\Users\\O'Neil\\AppData\\Local\\Programs\\t3-dashboard\\t3-dashboard.exe";
  const plan = servicePlan("win32", { ...base, exe, home: "C:\\Users\\O'Neil", env: { LOCALAPPDATA: "C:\\Users\\O'Neil\\AppData\\Local" } });
  assert.deepEqual(plan.files, []);
  const tr =
    `powershell.exe -NoProfile -WindowStyle Hidden -Command "& 'C:\\Users\\O''Neil\\AppData\\Local\\Programs\\t3-dashboard\\t3-dashboard.exe' ` +
    `start --port 4310 --log 'C:\\Users\\O''Neil\\AppData\\Local\\t3-dashboard\\dashboard.log'"`;
  const [create, end, run] = plan.install;
  assert.deepEqual(create!.args, ["/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", "T3 Dashboard", "/TR", tr]);
  assert.deepEqual(end!.args, ["/End", "/TN", "T3 Dashboard"]);
  assert.deepEqual(run!.args, ["/Run", "/TN", "T3 Dashboard"]);
  const [reg, start] = create!.onFail!;
  assert.deepEqual(reg!.args, ["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "T3 Dashboard", "/t", "REG_SZ", "/d", tr, "/f"]);
  assert.equal(start!.command, "powershell.exe");
  assert.deepEqual(start!.args.slice(0, 4), ["-NoProfile", "-WindowStyle", "Hidden", "-Command"]);
  assert.match(start!.args[4]!, /^Start-Process -WindowStyle Hidden -FilePath 'powershell\.exe' -ArgumentList /);
  assert.deepEqual(plan.restart.map((c) => c.args.join(" ")), ["/End /TN T3 Dashboard", "/Run /TN T3 Dashboard"]);
});

const run = (codes: Record<string, number> = {}) => {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      run: async (command: string, args: string[]) => {
        const line = `${command} ${args.join(" ")}`;
        calls.push(line);
        return codes[line] ?? 0;
      },
      writeFile: (path: string) => void calls.push(`write ${path}`),
      rm: (path: string) => void calls.push(`rm ${path}`),
    },
  };
};

test("applyPlan writes the files, then runs the commands in order", async () => {
  const { calls, deps } = run();
  await applyPlan(servicePlan("linux", base), "install", deps);
  assert.deepEqual(calls, [
    "write /home/ann/.config/systemd/user/t3-dashboard.service",
    "systemctl --user daemon-reload",
    "systemctl --user enable t3-dashboard.service",
    "systemctl --user restart t3-dashboard.service",
  ]);
});

test("applyPlan ignores a failing command marked ignoreError, but stops on others", async () => {
  const plan = servicePlan("darwin", { ...base, home: "/Users/ann" });
  const ok = run({ "launchctl bootout gui/501/t3-dashboard": 3 });
  await applyPlan(plan, "install", ok.deps);
  assert.equal(ok.calls.length, 3);
  const bad = run({ "launchctl bootstrap gui/501 /Users/ann/Library/LaunchAgents/t3-dashboard.plist": 5 });
  await assert.rejects(applyPlan(plan, "install", bad.deps), /launchctl.*exit 5/);
});

test("applyPlan falls back to the Run key when the task cannot be created", async () => {
  const plan: Plan = servicePlan("win32", { ...base, home: "C:\\u", env: { LOCALAPPDATA: "C:\\u\\l" } });
  const created = plan.install[0]!;
  const key = `${created.command} ${created.args.join(" ")}`;
  const { calls, deps } = run({ [key]: 1 });
  await applyPlan(plan, "install", deps);
  assert.equal(calls.length, 5);
  assert.match(calls[1]!, /^reg\.exe add /);
  assert.match(calls[2]!, /^powershell\.exe /);
});

test("applyPlan uninstall never fails on a missing service", async () => {
  const { calls, deps } = run({ "systemctl --user disable --now t3-dashboard.service": 1, "systemctl --user daemon-reload": 1 });
  await applyPlan(servicePlan("linux", base), "uninstall", deps);
  assert.equal(calls.length, 3);
});
