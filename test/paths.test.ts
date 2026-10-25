import assert from "node:assert/strict";
import { test } from "bun:test";
import { authFile, configDir, linearFile } from "../src/paths.ts";

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
