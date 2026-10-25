import assert from "node:assert/strict";
import { test } from "bun:test";
import { authFile, configDir, linearFile, logFile, pidFile, stateDir } from "../../src/config/paths.ts";

test("files live in the config directory, under the home by default", () => {
  assert.equal(configDir({}, "/home/ann"), "/home/ann/.config/t3-dashboard");
  assert.equal(authFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/auth.json");
  assert.equal(linearFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/linear.json");
});

test("T3_DASHBOARD_CONFIG_DIR moves both files, and the Linear variable still wins for its file", () => {
  const env = { T3_DASHBOARD_CONFIG_DIR: "/x/cfg" };
  assert.equal(authFile(env, "/h"), "/x/cfg/auth.json");
  assert.equal(linearFile(env, "/h"), "/x/cfg/linear.json");
  assert.equal(linearFile({ ...env, T3_DASHBOARD_LINEAR_FILE: "/x/l.json" }, "/h"), "/x/l.json");
});

test("state files follow each OS convention", () => {
  assert.equal(stateDir({}, "/home/ann", "linux"), "/home/ann/.local/state/t3-dashboard");
  assert.equal(stateDir({ XDG_STATE_HOME: "/s" }, "/home/ann", "linux"), "/s/t3-dashboard");
  assert.equal(stateDir({}, "/Users/ann", "darwin"), "/Users/ann/Library/Logs/t3-dashboard");
  assert.equal(stateDir({ LOCALAPPDATA: "C:\\Users\\ann\\AppData\\Local" }, "C:\\Users\\ann", "win32"), "C:\\Users\\ann\\AppData\\Local\\t3-dashboard");
  assert.equal(logFile({}, "/Users/ann", "darwin"), "/Users/ann/Library/Logs/t3-dashboard/dashboard.log");
  assert.equal(pidFile({}, "/home/ann", "linux"), "/home/ann/.local/state/t3-dashboard/dashboard.pid");
});
