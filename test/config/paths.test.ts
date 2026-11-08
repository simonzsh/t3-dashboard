import assert from "node:assert/strict";
import { test } from "bun:test";
import { authFile, automationThreadsFile, agentRulesTargets, agentsSkillsDir, claudeConfigDir, claudeStateFile, codexHome, managedClaudeMd, configDir, linearFile, logFile, newsDir, newsFile, pidFile, stateDir } from "../../src/config/paths.ts";

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
    { agent: "claude", dir: "/home/ann/.claude", file: "/home/ann/.claude/CLAUDE.md", always: true, imports: true },
    { agent: "codex", dir: "/home/ann/.codex", file: "/home/ann/.codex/AGENTS.md", always: true, imports: false },
    { agent: "opencode", dir: "/home/ann/.config/opencode", file: "/home/ann/.config/opencode/AGENTS.md", always: false, imports: false },
    { agent: "grok", dir: "/home/ann/.grok", file: "/home/ann/.grok/AGENTS.md", always: false, imports: false },
  ]);
  const custom = agentRulesTargets({ CLAUDE_CONFIG_DIR: "/c", CODEX_HOME: "/x", XDG_CONFIG_HOME: "/xdg", OPENCODE_CONFIG_DIR: "/ignored" }, "/h");
  assert.deepEqual(custom.map((t) => t.file), ["/c/CLAUDE.md", "/x/AGENTS.md", "/xdg/opencode/AGENTS.md", "/h/.grok/AGENTS.md"]);
});

test("the news settings and the article folder follow the config directory, as absolute paths", () => {
  assert.equal(newsFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/news.json");
  assert.equal(newsDir({}, "/home/ann"), "/home/ann/.config/t3-dashboard/news");
  assert.equal(newsDir({ T3_DASHBOARD_CONFIG_DIR: "/x/cfg" }, "/h"), "/x/cfg/news");
  assert.equal(newsDir({ T3_DASHBOARD_CONFIG_DIR: "rel/cfg" }, "/h").startsWith("/"), true);
});

test("the Claude and Codex folders follow their variables; the state file moves inside CLAUDE_CONFIG_DIR", () => {
  assert.equal(claudeConfigDir({}, "/h"), "/h/.claude");
  assert.equal(claudeConfigDir({ CLAUDE_CONFIG_DIR: "/c" }, "/h"), "/c");
  assert.equal(claudeStateFile({}, "/h"), "/h/.claude.json");
  assert.equal(claudeStateFile({ CLAUDE_CONFIG_DIR: "/c" }, "/h"), "/c/.claude.json");
  assert.equal(codexHome({}, "/h"), "/h/.codex");
  assert.equal(codexHome({ CODEX_HOME: "/x" }, "/h"), "/x");
  assert.equal(agentsSkillsDir("/h"), "/h/.agents/skills");
});

test("the managed CLAUDE.md sits in the system folder of each OS", () => {
  assert.equal(managedClaudeMd("linux"), "/etc/claude-code/CLAUDE.md");
  assert.equal(managedClaudeMd("darwin"), "/Library/Application Support/ClaudeCode/CLAUDE.md");
  assert.equal(managedClaudeMd("win32"), "C:\\Program Files\\ClaudeCode\\CLAUDE.md");
});
