import assert from "node:assert/strict";
import { test } from "bun:test";
import { authFile, automationThreadsFile, agentRulesTargets, configDir, linearFile, logFile, newsDir, newsFile, pidFile, stateDir } from "../../src/config/paths.ts";

test("files live in the config directory, under the home by default", () => {
  assert.equal(configDir({}, "/home/ann"), "/home/ann/.config/t3-dashboard");
  assert.equal(authFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/auth.json");
  assert.equal(linearFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/linear.json");
  assert.equal(automationThreadsFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/automation-threads.json");
});

test("T3_DASHBOARD_CONFIG_DIR moves both files, and the Linear variable still wins for its file", () => {
  const env = { T3_DASHBOARD_CONFIG_DIR: "/x/cfg" };
  assert.equal(authFile(env, "/h"), "/x/cfg/auth.json");
  assert.equal(linearFile(env, "/h"), "/x/cfg/linear.json");
  assert.equal(automationThreadsFile(env, "/h"), "/x/cfg/automation-threads.json");
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

test("the agent rules targets follow each agent's home", () => {
  assert.deepEqual(agentRulesTargets({}, "/home/ann"), [
    { agent: "claude", dir: "/home/ann/.claude", file: "/home/ann/.claude/CLAUDE.md", always: true },
    { agent: "codex", dir: "/home/ann/.codex", file: "/home/ann/.codex/AGENTS.md", always: true },
    { agent: "antigravity", dir: "/home/ann/.gemini", file: "/home/ann/.gemini/GEMINI.md", always: false },
    { agent: "opencode", dir: "/home/ann/.config/opencode", file: "/home/ann/.config/opencode/AGENTS.md", always: false },
  ]);
  const custom = agentRulesTargets({ CLAUDE_CONFIG_DIR: "/c", CODEX_HOME: "/x", GEMINI_HOME: "/g", XDG_CONFIG_HOME: "/xdg", OPENCODE_CONFIG_DIR: "/ignored" }, "/h");
  assert.deepEqual(custom.map((t) => t.file), ["/c/CLAUDE.md", "/x/AGENTS.md", "/g/GEMINI.md", "/xdg/opencode/AGENTS.md"]);
});

test("the news settings and the article folder follow the config directory, as absolute paths", () => {
  assert.equal(newsFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/news.json");
  assert.equal(newsDir({}, "/home/ann"), "/home/ann/.config/t3-dashboard/news");
  assert.equal(newsDir({ T3_DASHBOARD_CONFIG_DIR: "/x/cfg" }, "/h"), "/x/cfg/news");
  assert.equal(newsDir({ T3_DASHBOARD_CONFIG_DIR: "rel/cfg" }, "/h").startsWith("/"), true);
});
