import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardProject } from "../../shared/api.ts";
import { memorySetupFs } from "../../src/config/agentSetupFs.ts";
import { CONTENT_BUDGET_BYTES, MAX_MARKDOWN_BYTES, createAgentSetup } from "../../src/domain/agentSetup.ts";
import { MASK } from "../../src/domain/secretMask.ts";
import { FAKE_CLI_VALUE, FAKE_GHP, FAKE_GHP_LONG, fake } from "../helpers/fakeSecrets.ts";

const HOME = "/home/ann";
const NOW = new Date("2026-02-03T04:05:06Z");

const project = (id: string, root: string | undefined, extra: Partial<DashboardProject> = {}): DashboardProject => ({ id, title: id.toUpperCase(), defaultModelSelection: null, icon: null, ...(root ? { workspaceRoot: root } : {}), ...extra });

interface Rig {
  files: Record<string, string>;
  links?: Record<string, string>;
  projects?: DashboardProject[];
  env?: Record<string, string>;
  platform?: NodeJS.Platform;
}
function rig({ files, links, projects = [], env = {}, platform = "linux" }: Rig, clock = { now: NOW }) {
  const fs = memorySetupFs(files, links);
  let reads = 0;
  const counted = { ...fs, entry: (path: string) => (reads++, fs.entry(path)) };
  const setup = createAgentSetup({ fs: counted, env, home: HOME, platform, projects: () => projects, now: () => clock.now });
  return { setup, reads: () => reads, clock };
}

const ids = (steps: { fileId: string }[]) => steps.map((s) => s.fileId);
const layerOf = (steps: { fileId: string; layer: string }[], layer: string) => steps.filter((s) => s.layer === layer).map((s) => s.fileId);

test("the Claude instruction chain runs from the filesystem root down to the project, imports right after their file", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude/CLAUDE.md`]: "Be brief. @rules/style.md",
      [`${HOME}/.claude/rules/style.md`]: "style",
      [`${HOME}/.claude/rules/zeta.md`]: "z",
      [`${HOME}/src/CLAUDE.md`]: "parent",
      [`${HOME}/src/app/CLAUDE.md`]: "app @docs/a.md",
      [`${HOME}/src/app/docs/a.md`]: "a @b.md",
      [`${HOME}/src/app/docs/b.md`]: "b",
      [`${HOME}/src/app/.claude/CLAUDE.md`]: "dot",
      [`${HOME}/src/app/CLAUDE.local.md`]: "mine",
      [`${HOME}/src/app/.claude/rules/r.md`]: "rule",
    },
    projects: [project("p", `${HOME}/src/app`)],
  });
  const inv = await setup.get();
  const chain = inv.projects[0]!.claude;
  assert.deepEqual(layerOf(chain.steps, "instructions"), [
    `${HOME}/.claude/CLAUDE.md`,
    `${HOME}/.claude/rules/style.md`,
    `${HOME}/.claude/rules/zeta.md`,
    `${HOME}/src/CLAUDE.md`,
    `${HOME}/src/app/CLAUDE.md`,
    `${HOME}/src/app/docs/a.md`,
    `${HOME}/src/app/docs/b.md`,
    `${HOME}/src/app/.claude/CLAUDE.md`,
    `${HOME}/src/app/CLAUDE.local.md`,
    `${HOME}/src/app/.claude/rules/r.md`,
  ]);
  const files = inv.files;
  assert.deepEqual(files[`${HOME}/src/app/CLAUDE.md`]!.imports, [`${HOME}/src/app/docs/a.md`]);
  assert.equal(files[`${HOME}/src/app/docs/a.md`]!.kind, "import");
  assert.equal(files[`${HOME}/src/app/docs/a.md`]!.scope, "project");
  assert.equal(files[`${HOME}/src/app/CLAUDE.local.md`]!.scope, "local");
  assert.equal(files[`${HOME}/.claude/rules/zeta.md`]!.kind, "rule");
  assert.deepEqual(chain.steps.find((s) => s.fileId === `${HOME}/src/app/docs/a.md`)?.note, `imported by ${HOME}/src/app/CLAUDE.md`);
  assert.deepEqual(inv.userFileIds, [`${HOME}/.claude/CLAUDE.md`, `${HOME}/.claude/rules/style.md`, `${HOME}/.claude/rules/zeta.md`]);
  assert.deepEqual(inv.projects[0]!.fileIds.slice(0, 2), [`${HOME}/src/CLAUDE.md`, `${HOME}/src/app/CLAUDE.md`]);
});

test("a ~/ import resolves from the home, a missing one is a warning on the importing file", async () => {
  const { setup } = rig({ files: { [`${HOME}/.claude/CLAUDE.md`]: "@~/notes/n.md and @./missing.md", [`${HOME}/notes/n.md`]: "n" } });
  const inv = await setup.get();
  const file = inv.files[`${HOME}/.claude/CLAUDE.md`]!;
  assert.deepEqual(file.imports, [`${HOME}/notes/n.md`]);
  assert.deepEqual(file.issues.map((i) => [i.code, i.severity, i.path]), [["broken-import", "warning", `${HOME}/.claude/missing.md`]]);
});

test("imports stop after four levels and a cycle is followed once", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude/CLAUDE.md`]: "@a.md",
      [`${HOME}/.claude/a.md`]: "@b.md",
      [`${HOME}/.claude/b.md`]: "@c.md @CLAUDE.md",
      [`${HOME}/.claude/c.md`]: "@d.md",
      [`${HOME}/.claude/d.md`]: "@e.md",
      [`${HOME}/.claude/e.md`]: "end",
    },
    projects: [project("p", `${HOME}/x`)],
  });
  const inv = await setup.get();
  assert.equal(inv.files[`${HOME}/.claude/d.md`]!.issues[0]?.code, "import-depth");
  assert.equal(inv.files[`${HOME}/.claude/e.md`], undefined);
  assert.equal(ids(inv.projects[0]!.claude.steps).filter((id) => id === `${HOME}/.claude/CLAUDE.md`).length, 1);
});

test("an AGENTS.md imported by CLAUDE.md is read; one with no CLAUDE.md on the walk is read too", async () => {
  const withClaude = rig({ files: { [`${HOME}/a/CLAUDE.md`]: "@AGENTS.md", [`${HOME}/a/AGENTS.md`]: "x", [`${HOME}/b/AGENTS.md`]: "y" }, projects: [project("a", `${HOME}/a`), project("b", `${HOME}/b`)] });
  const inv = await withClaude.setup.get();
  const [a, b] = inv.projects;
  assert.equal(a!.claude.steps.find((s) => s.fileId === `${HOME}/a/AGENTS.md`)?.active, true);
  assert.deepEqual(a!.claude.issues, []);
  // b has no CLAUDE.md of its own, so its AGENTS.md is read.
  assert.equal(b!.claude.steps.find((s) => s.fileId === `${HOME}/b/AGENTS.md`)?.active, true);
});

test("an AGENTS.md next to a CLAUDE.md that does not import it is inactive and reported", async () => {
  const { setup } = rig({ files: { [`${HOME}/a/CLAUDE.md`]: "plain", [`${HOME}/a/AGENTS.md`]: "x" }, projects: [project("a", `${HOME}/a`)] });
  const chain = (await setup.get()).projects[0]!.claude;
  const entry = chain.steps.find((s) => s.fileId === `${HOME}/a/AGENTS.md`)!;
  assert.equal(entry.active, false);
  assert.deepEqual(chain.issues.map((i) => [i.code, i.path]), [["agents-md-ignored", `${HOME}/a/AGENTS.md`]]);
});

test("a rule with paths: frontmatter is a conditional, inactive step", async () => {
  const { setup } = rig({ files: { [`${HOME}/.claude/rules/c.md`]: "---\npaths:\n  - src/**\n---\nbody", [`${HOME}/.claude/rules/d.md`]: "plain" }, projects: [project("p", `${HOME}/x`)] });
  const steps = (await setup.get()).projects[0]!.claude.steps;
  assert.deepEqual(steps.filter((s) => s.layer === "instructions").map((s) => [s.fileId.split("/").pop(), s.active, s.note]), [["c.md", false, "conditional: loads only for matching files"], ["d.md", true, undefined]]);
});

test("CLAUDE_CONFIG_DIR moves the Claude folder and the state file into it", async () => {
  const { setup } = rig({
    env: { CLAUDE_CONFIG_DIR: "/cfg" },
    files: { "/cfg/CLAUDE.md": "u", "/cfg/.claude.json": JSON.stringify({ mcpServers: { a: { command: "x" } } }), [`${HOME}/.claude.json`]: JSON.stringify({ mcpServers: { wrong: { command: "x" } } }), [`${HOME}/.claude/CLAUDE.md`]: "old" },
  });
  const inv = await setup.get();
  assert.deepEqual(inv.dirs, { claude: "/cfg", claudeState: "/cfg/.claude.json", codex: `${HOME}/.codex` });
  assert.deepEqual(inv.mcpServers.map((s) => s.name), ["a"]);
  assert.equal(inv.files[`${HOME}/.claude/CLAUDE.md`], undefined);
});

test("the managed CLAUDE.md of the platform is the first managed file", async () => {
  const { setup } = rig({ platform: "darwin", files: { "/Library/Application Support/ClaudeCode/CLAUDE.md": "policy", "/etc/claude-code/CLAUDE.md": "linux" } });
  const inv = await setup.get();
  assert.deepEqual(inv.userFileIds, ["/Library/Application Support/ClaudeCode/CLAUDE.md"]);
  assert.equal(inv.files["/Library/Application Support/ClaudeCode/CLAUDE.md"]!.scope, "managed");
});

test("Claude settings: order, hooks and plugins merged with the later layer winning", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude/settings.json`]: JSON.stringify({ enabledPlugins: { "a@m": true, "b@m": true }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `/x/check.sh --token ${FAKE_CLI_VALUE}`, timeout: 9 }] }] } }),
      [`${HOME}/w/p/.claude/settings.json`]: JSON.stringify({ enabledPlugins: { "b@m": false, "c@m": true } }),
      [`${HOME}/w/.claude/settings.local.json`]: JSON.stringify({ enabledPlugins: { "b@m": true } }),
      [`${HOME}/w/.git`]: "",
    },
    projects: [project("p", `${HOME}/w/p`)],
  });
  // The project sits in a subfolder of the git root, so the local file comes from the root.
  const inv = await setup.get();
  const chain = inv.projects[0]!.claude;
  assert.equal(inv.projects[0]!.gitRoot, `${HOME}/w`);
  assert.deepEqual(layerOf(chain.steps, "settings"), [`${HOME}/.claude/settings.json`, `${HOME}/w/p/.claude/settings.json`, `${HOME}/w/.claude/settings.local.json`]);
  assert.deepEqual(chain.pluginIds.map((id) => id.split("#")[1]), ["a@m", "b@m", "c@m"]);
  assert.equal(chain.pluginIds.find((id) => id.endsWith("#b@m"))?.startsWith(`${HOME}/w/.claude/settings.local.json`), true);
  const hook = inv.hooks[0]!;
  assert.deepEqual([hook.event, hook.matcher, hook.type, hook.target, hook.timeoutSec, hook.scope], ["PreToolUse", "Bash", "command", `/x/check.sh --token ${MASK}`, 9, "user"]);
  assert.deepEqual(chain.hookIds, [hook.id]);
});

test("a later settings layer turns a plugin off", async () => {
  const { setup } = rig({
    files: { [`${HOME}/.claude/settings.json`]: JSON.stringify({ enabledPlugins: { "a@m": true } }), [`${HOME}/p/.claude/settings.json`]: JSON.stringify({ enabledPlugins: { "a@m": false } }) },
    projects: [project("p", `${HOME}/p`)],
  });
  assert.deepEqual((await setup.get()).projects[0]!.claude.pluginIds, []);
});

test("Claude MCP: local beats project beats user by name, and the losers are shadowed", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude.json`]: JSON.stringify({
        mcpServers: { shared: { command: "user-cmd" }, onlyUser: { command: "u" } },
        projects: { [`${HOME}/p`]: { mcpServers: { shared: { command: "local-cmd" }, mine: { type: "http", url: "https://h.example.com/mcp" } } } },
      }),
      [`${HOME}/.mcp.json`]: JSON.stringify({ mcpServers: { shared: { command: "project-cmd" }, onlyProject: { command: "p" } } }),
    },
    projects: [project("p", `${HOME}/p`), project("q", `${HOME}/q`)],
  });
  const inv = await setup.get();
  const byId = new Map(inv.mcpServers.map((s) => [s.id, s]));
  const named = (list: string[]) => list.map((id) => `${byId.get(id)!.scope}:${byId.get(id)!.name}`).sort();
  const p = inv.projects[0]!.claude;
  assert.deepEqual(named(p.mcpServerIds), ["local:mine", "local:shared", "project:onlyProject", "user:onlyUser"]);
  assert.deepEqual(named(p.shadowedMcpServerIds), ["project:shared", "user:shared"]);
  const q = inv.projects[1]!.claude;
  assert.deepEqual(named(q.mcpServerIds), ["project:onlyProject", "project:shared", "user:onlyUser"]);
  assert.deepEqual(named(q.shadowedMcpServerIds), ["user:shared"]);
  const local = inv.mcpServers.find((s) => s.name === "mine")!;
  assert.equal(local.id, `claude:local:${HOME}/.claude.json@${HOME}/p#mine`);
  assert.deepEqual(local.projectIds, ["p"]);
  assert.deepEqual(inv.mcpServers.find((s) => s.name === "onlyUser")!.projectIds, []);
  assert.deepEqual(inv.mcpServers.find((s) => s.name === "onlyProject")!.projectIds, ["p", "q"]);
});

test(".mcp.json is found in the closest parent, and never read from a sibling", async () => {
  const { setup } = rig({
    files: { [`${HOME}/a/.mcp.json`]: JSON.stringify({ mcpServers: { far: { command: "x" } } }), [`${HOME}/a/b/.mcp.json`]: JSON.stringify({ mcpServers: { near: { command: "x" } } }), [`${HOME}/a/c/.mcp.json`]: JSON.stringify({ mcpServers: { sibling: { command: "x" } } }) },
    projects: [project("p", `${HOME}/a/b/deep`)],
  });
  const inv = await setup.get();
  const names = inv.mcpServers.filter((s) => inv.projects[0]!.claude.mcpServerIds.includes(s.id)).map((s) => s.name);
  assert.deepEqual(names, ["near"]);
});

test("an MCP entry with a url and no type is an error, and values are masked", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.mcp.json`]: JSON.stringify({
        mcpServers: {
          bad: { url: "https://h.example.com/mcp" },
          web: { type: "http", url: "https://h.example.com/mcp?api_key=SECRETVALUE1", headers: { Authorization: "Bearer SECRETVALUE2", "X-Ref": "${OK}" } },
          run: { command: "npx", args: ["-y", "pkg", "--token", "SECRETVALUE3"], env: { GITHUB_TOKEN: "SECRETVALUE4", MODE: "dev" } },
        },
      }),
    },
    projects: [project("p", `${HOME}/p`)],
  });
  const inv = await setup.get();
  const byName = Object.fromEntries(inv.mcpServers.map((s) => [s.name, s]));
  assert.deepEqual(byName.bad!.issues.map((i) => [i.code, i.severity]), [["url-without-type", "error"]]);
  assert.equal(byName.bad!.transport, "unknown");
  assert.equal(byName.web!.url, `https://h.example.com/mcp?api_key=${MASK}`);
  assert.deepEqual(byName.web!.headers, [{ key: "Authorization", value: `Bearer ${MASK}` }, { key: "X-Ref", value: "${OK}" }]);
  assert.deepEqual(byName.run!.args, ["-y", "pkg", "--token", MASK]);
  assert.deepEqual(byName.run!.env, [{ key: "GITHUB_TOKEN", value: MASK }, { key: "MODE", value: "dev" }]);
  assert.deepEqual([byName.web!.masked, byName.run!.masked], [true, true]);
  assert.equal(JSON.stringify(inv).includes("SECRETVALUE"), false);
});

test(".claude.json content is never sent, only its servers are read", async () => {
  const { setup } = rig({ files: { [`${HOME}/.claude.json`]: JSON.stringify({ oauthAccount: { emailAddress: "someone@example.com", token: "OAUTHSECRET" }, mcpServers: { a: { command: "x" } } }) } });
  const inv = await setup.get();
  const file = inv.files[`${HOME}/.claude.json`]!;
  assert.deepEqual([file.kind, file.content], ["state", { type: "omitted", reason: "private" }]);
  assert.equal(JSON.stringify(inv).includes("OAUTHSECRET"), false);
  assert.equal(JSON.stringify(inv).includes("someone@example.com"), false);
  assert.equal(inv.mcpServers.length, 1);
});

test("skills, agents and commands list their frontmatter and never their body", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude/skills/deploy/SKILL.md`]: "---\nname: deploy-it\ndescription: Ships it\n---\nBODYTEXT",
      [`${HOME}/.claude/skills/plain/SKILL.md`]: "no frontmatter BODYTEXT",
      [`${HOME}/.claude/agents/team/rev.md`]: "---\ndescription: Reviews\nmodel: opus\n---\nBODYTEXT",
      [`${HOME}/.claude/commands/go.md`]: "go BODYTEXT",
      [`${HOME}/p/.claude/skills/local/SKILL.md`]: "---\nname: local\n---\n",
    },
    projects: [project("p", `${HOME}/p`)],
  });
  const inv = await setup.get();
  const chain = inv.projects[0]!.claude;
  assert.deepEqual(layerOf(chain.steps, "skills").map((id) => inv.files[id]!.name), ["deploy-it", "plain", "local"]);
  assert.deepEqual(layerOf(chain.steps, "agents").map((id) => inv.files[id]!.name), ["rev"]);
  assert.deepEqual(layerOf(chain.steps, "commands").map((id) => inv.files[id]!.name), ["go"]);
  assert.equal(inv.files[`${HOME}/.claude/skills/deploy/SKILL.md`]!.description, "Ships it");
  assert.deepEqual(inv.files[`${HOME}/.claude/agents/team/rev.md`]!.content, { type: "fields", fields: [{ key: "description", value: "Reviews" }, { key: "model", value: "opus" }] });
  assert.equal(JSON.stringify(inv).includes("BODYTEXT"), false);
  assert.equal(inv.files[`${HOME}/p/.claude/skills/local/SKILL.md`]!.scope, "project");
});

test("Codex instructions: the override wins, then each folder from the git root down, one file per folder", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.codex/AGENTS.md`]: "global",
      [`${HOME}/r/.git`]: "",
      [`${HOME}/r/AGENTS.md`]: "root",
      [`${HOME}/r/AGENTS.override.md`]: "override",
      [`${HOME}/r/pkg/TEAM.md`]: "team",
      [`${HOME}/r/pkg/app/AGENTS.md`]: "app",
      [`${HOME}/.codex/config.toml`]: 'project_doc_fallback_filenames = ["TEAM.md"]',
    },
    projects: [project("p", `${HOME}/r/pkg/app`)],
  });
  const chain = (await setup.get()).projects[0]!.codex;
  const instr = chain.steps.filter((s) => s.layer === "instructions");
  assert.deepEqual(instr.map((s) => [s.fileId.replace(HOME, "~"), s.active]), [
    ["~/.codex/AGENTS.md", true],
    ["~/r/AGENTS.override.md", true],
    ["~/r/AGENTS.md", false],
    ["~/r/pkg/TEAM.md", true],
    ["~/r/pkg/app/AGENTS.md", true],
  ]);
  assert.match(instr[2]!.note!, /AGENTS\.override\.md is used/);
});

test("Codex falls back to AGENTS.md when the override is empty; a Claude-free tree has no other AGENTS", async () => {
  const { setup } = rig({ files: { [`${HOME}/.codex/AGENTS.override.md`]: "", [`${HOME}/.codex/AGENTS.md`]: "g" }, projects: [] });
  const inv = await setup.get();
  assert.equal(inv.files[`${HOME}/.codex/AGENTS.md`]!.tools.includes("codex"), true);
  assert.equal(inv.files[`${HOME}/.codex/AGENTS.override.md`]!.tools.includes("codex"), false);
});

test("Codex warns when the project instructions pass project_doc_max_bytes", async () => {
  const { setup } = rig({ files: { [`${HOME}/.codex/config.toml`]: "project_doc_max_bytes = 10", [`${HOME}/p/AGENTS.md`]: "x".repeat(11) }, projects: [project("p", `${HOME}/p`)] });
  const chain = (await setup.get()).projects[0]!.codex;
  assert.deepEqual(chain.issues.map((i) => i.code), ["over-codex-limit"]);
});

const CODEX_USER = `
[mcp_servers.shared]
command = "user-cmd"
[mcp_servers.docs]
url = "https://docs.example.com/mcp"
bearer_token_env_var = "DOCS_TOKEN"
[mcp_servers.off]
command = "x"
enabled = false
[mcp_servers.keyed]
url = "https://k.example.com/mcp"
env_http_headers = { "X-Api-Key" = "KEY_VAR" }
http_headers = { "X-Plain" = "${FAKE_GHP}" }
[projects."${HOME}/trusted"]
trust_level = "trusted"
`;

test("Codex config: user then project, closest wins by name; MCP entries show env-var names, not values", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.codex/config.toml`]: CODEX_USER,
      [`${HOME}/trusted/.codex/config.toml`]: '[mcp_servers.shared]\ncommand = "project-cmd"\n[hooks]\n[[hooks.Stop]]\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "bye"\n',
      [`${HOME}/trusted/.codex/hooks.json`]: JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "chk" }] }] } }),
      [`${HOME}/.codex/hooks.json`]: JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "hi" }] }] } }),
      [`${HOME}/trusted/.git`]: "",
    },
    projects: [project("t", `${HOME}/trusted`)],
  });
  const inv = await setup.get();
  const chain = inv.projects[0]!.codex;
  const byId = new Map(inv.mcpServers.map((s) => [s.id, s]));
  assert.deepEqual(chain.mcpServerIds.map((id) => byId.get(id)!.name).sort(), ["docs", "keyed", "off", "shared"]);
  assert.deepEqual(chain.shadowedMcpServerIds.map((id) => byId.get(id)!.scope), ["user"]);
  const docs = inv.mcpServers.find((s) => s.name === "docs")!;
  assert.deepEqual([docs.transport, docs.headers], ["http", [{ key: "Authorization", value: "Bearer $DOCS_TOKEN" }]]);
  assert.equal(inv.mcpServers.find((s) => s.name === "off")!.enabled, false);
  const keyed = inv.mcpServers.find((s) => s.name === "keyed")!;
  assert.deepEqual(keyed.headers, [{ key: "X-Plain", value: MASK }, { key: "X-Api-Key", value: "$KEY_VAR" }]);
  assert.deepEqual(layerOf(chain.steps, "config"), [`${HOME}/.codex/config.toml`, `${HOME}/trusted/.codex/config.toml`]);
  assert.deepEqual(chain.hookIds.map((id) => id.replace(HOME, "~")), ["~/.codex/hooks.json#SessionStart#0.0", "~/trusted/.codex/hooks.json#PreToolUse#0.0", "~/trusted/.codex/config.toml#Stop#0.0"]);
  assert.deepEqual(chain.issues, []);
});

test("an untrusted project's Codex config and hooks are listed but inactive", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.codex/config.toml`]: CODEX_USER,
      [`${HOME}/open/.codex/config.toml`]: '[mcp_servers.secretly]\ncommand = "x"',
      [`${HOME}/open/.codex/hooks.json`]: JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }] } }),
    },
    projects: [project("o", `${HOME}/open`)],
  });
  const inv = await setup.get();
  const chain = inv.projects[0]!.codex;
  assert.deepEqual(chain.steps.filter((s) => s.scope === "project").map((s) => [s.layer, s.active, s.note]), [["config", false, "project not trusted by Codex"], ["hooks", false, "project not trusted by Codex"]]);
  assert.deepEqual(chain.issues.map((i) => i.code), ["not-trusted"]);
  assert.equal(inv.mcpServers.some((s) => s.name === "secretly"), false);
  assert.equal(chain.hookIds.length, 0);
});

test("CODEX_HOME moves the Codex folder", async () => {
  const { setup } = rig({ env: { CODEX_HOME: "/cx" }, files: { "/cx/AGENTS.md": "g", [`${HOME}/.codex/AGENTS.md`]: "old" } });
  const inv = await setup.get();
  assert.equal(inv.dirs.codex, "/cx");
  assert.deepEqual(inv.userFileIds, ["/cx/AGENTS.md"]);
});

test("Codex skills: user, then folders from the project up to the git root, then the legacy folder", async () => {
  const skill = (n: string) => `---\nname: ${n}\n---\n`;
  const { setup } = rig({
    files: {
      [`${HOME}/.agents/skills/u/SKILL.md`]: skill("u"),
      [`${HOME}/r/.git`]: "",
      [`${HOME}/r/.agents/skills/root/SKILL.md`]: skill("root"),
      [`${HOME}/r/app/.agents/skills/app/SKILL.md`]: skill("app"),
      [`${HOME}/.codex/skills/old/SKILL.md`]: skill("old"),
      [`${HOME}/.codex/skills/.system/hidden/SKILL.md`]: skill("hidden"),
    },
    projects: [project("p", `${HOME}/r/app`)],
  });
  const inv = await setup.get();
  const steps = inv.projects[0]!.codex.steps.filter((s) => s.layer === "skills");
  assert.deepEqual(steps.map((s) => [inv.files[s.fileId]!.name, s.note]), [["u", undefined], ["app", undefined], ["root", undefined], ["old", "legacy location"]]);
});

test("a Claude CLAUDE.md that is a broken symlink is a warning, not a crash", async () => {
  const { setup } = rig({ files: { [`${HOME}/other.md`]: "x" }, links: { [`${HOME}/p/CLAUDE.md`]: `${HOME}/gone.md` }, projects: [project("p", `${HOME}/p`)] });
  const inv = await setup.get();
  const file = inv.files[`${HOME}/p/CLAUDE.md`]!;
  assert.deepEqual([file.status, file.linkTarget, file.sizeBytes, file.issues.map((i) => i.code)], ["broken-symlink", `${HOME}/gone.md`, null, ["broken-symlink"]]);
  assert.equal(inv.projects[0]!.claude.steps.some((s) => s.fileId === file.id), true);
});

test("a bad or oversized config file gets a status and an issue, and its raw text never leaves", async () => {
  const { setup } = rig({
    files: { [`${HOME}/.claude/settings.json`]: '{"env": {"A": "RAWSECRET1"', [`${HOME}/.codex/config.toml`]: "a = = RAWSECRET2", [`${HOME}/.mcp.json`]: `{"x":"${"a".repeat(1_048_577)}"}` },
    projects: [project("p", `${HOME}/p`)],
  });
  const inv = await setup.get();
  assert.deepEqual([inv.files[`${HOME}/.claude/settings.json`]!.status, inv.files[`${HOME}/.claude/settings.json`]!.issues[0]!.code], ["invalid", "invalid-json"]);
  assert.deepEqual([inv.files[`${HOME}/.codex/config.toml`]!.status, inv.files[`${HOME}/.codex/config.toml`]!.issues[0]!.code], ["invalid", "invalid-toml"]);
  assert.deepEqual([inv.files[`${HOME}/.mcp.json`]!.status, inv.files[`${HOME}/.mcp.json`]!.content], ["too-large", { type: "omitted", reason: "too-large" }]);
  assert.equal(JSON.stringify(inv).includes("RAWSECRET"), false);
});

test("settings data is masked in the file content", async () => {
  const { setup } = rig({ files: { [`${HOME}/.claude/settings.json`]: JSON.stringify({ env: { API_TOKEN: "TOPSECRET", MODE: "dev" }, model: "opus" }) } });
  const file = (await setup.get()).files[`${HOME}/.claude/settings.json`]!;
  assert.deepEqual(file.content, { type: "data", format: "json", value: { env: { API_TOKEN: MASK, MODE: "dev" }, model: "opus" } });
});

test("a long Markdown file is cut with an info issue", async () => {
  const { setup } = rig({ files: { [`${HOME}/.claude/CLAUDE.md`]: "x".repeat(MAX_MARKDOWN_BYTES + 5) } });
  const file = (await setup.get()).files[`${HOME}/.claude/CLAUDE.md`]!;
  assert.equal(file.content.type === "markdown" && file.content.truncated, true);
  assert.equal(file.content.type === "markdown" && file.content.text.length, MAX_MARKDOWN_BYTES);
  assert.deepEqual(file.issues.map((i) => [i.code, i.severity]), [["truncated", "info"]]);
});

test("past the total budget, files are omitted and the inventory is partial", async () => {
  const big = "y".repeat(MAX_MARKDOWN_BYTES);
  const count = Math.ceil(CONTENT_BUDGET_BYTES / MAX_MARKDOWN_BYTES) + 2;
  const files: Record<string, string> = {};
  for (let at = 0; at < count; at++) files[`${HOME}/.claude/rules/r${String(at).padStart(3, "0")}.md`] = big;
  const inv = await rig({ files }).setup.get();
  const contents = Object.values(inv.files).map((f) => f.content);
  assert.equal(inv.partial, true);
  assert.equal(contents.filter((c) => c.type === "omitted" && c.reason === "budget").length, 2);
  assert.equal(contents.filter((c) => c.type === "markdown").length, count - 2);
});

test("archived and folderless projects are skipped; the project root is normalized", async () => {
  const { setup } = rig({ files: {}, projects: [project("a", `${HOME}/a`, { archived: true }), project("b", undefined), project("c", `${HOME}/c//`)] });
  const inv = await setup.get();
  assert.deepEqual(inv.projects.map((p) => [p.projectId, p.root, p.gitRoot, p.title]), [["c", `${HOME}/c`, null, "C"]]);
});

test("gitRoot is the nearest ancestor-or-self holding .git, a file counts", async () => {
  const { setup } = rig({ files: { [`${HOME}/r/.git`]: "gitdir: x", [`${HOME}/r/s/.git/HEAD`]: "ref" }, projects: [project("in", `${HOME}/r/s/t`), project("top", `${HOME}/r`)] });
  const inv = await setup.get();
  assert.deepEqual(inv.projects.map((p) => p.gitRoot), [`${HOME}/r/s`, `${HOME}/r`]);
});

test("the inventory is cached for 30 seconds, and refresh reads again", async () => {
  const { setup, reads, clock } = rig({ files: { [`${HOME}/.claude/CLAUDE.md`]: "x" } });
  const first = await setup.get();
  const afterFirst = reads();
  assert.equal(await setup.get(), first);
  assert.equal(reads(), afterFirst);
  clock.now = new Date(NOW.getTime() + 29_000);
  assert.equal(await setup.get(), first);
  clock.now = new Date(NOW.getTime() + 31_000);
  const later = await setup.get();
  assert.notEqual(later, first);
  assert.equal(later.readAt, "2026-02-03T04:05:37.000Z");
  const forced = await setup.get(true);
  assert.notEqual(forced, later);
});

test("concurrent reads share one scan", async () => {
  const { setup, reads } = rig({ files: { [`${HOME}/.claude/CLAUDE.md`]: "x" } });
  const [a, b] = await Promise.all([setup.get(), setup.get()]);
  assert.equal(a, b);
  const once = reads();
  await setup.get();
  assert.equal(reads(), once);
});

test("get never throws: a failing fs becomes an issue", async () => {
  const fs = { entry: async () => Promise.reject(new Error("disk")), readText: async () => ({ text: "", truncated: false }), list: async () => [] as string[] };
  const setup = createAgentSetup({ fs, env: {}, home: HOME, platform: "linux", projects: () => [], now: () => NOW });
  const inv = await setup.get();
  assert.deepEqual(inv.issues.map((i) => i.code), ["unreadable"]);
  assert.deepEqual(inv.projects, []);
});

test("an import of a non-markdown file is listed but never sent as text", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude/CLAUDE.md`]: "@~/proj/.env @./notes.json @~/.claude.json @./plain.txt",
      [`${HOME}/proj/.env`]: `KEY=${fake("sk", "-live-REALSECRET123")}`,
      [`${HOME}/.claude/notes.json`]: '{"token":"hunter2"}',
      [`${HOME}/.claude.json`]: '{"oauth":"hunter3"}',
      [`${HOME}/.claude/plain.txt`]: "hello",
    },
  });
  const inv = await setup.get();
  const text = JSON.stringify(inv);
  for (const secret of ["REALSECRET123", "hunter2", "hunter3"]) assert.equal(text.includes(secret), false, secret);
  assert.ok(inv.files[`${HOME}/proj/.env`]);
  assert.equal(inv.files[`${HOME}/.claude/plain.txt`]!.content.type, "markdown");
});

test("a config file imported from markdown is still parsed as a config and never sent raw", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/src/app/CLAUDE.md`]: "Servers live in @.mcp.json",
      [`${HOME}/src/app/.mcp.json`]: '{"mcpServers":{"a":{"command":"node","args":["x"],"env":{"API_TOKEN":"rawvalue1234"}}}}',
    },
    projects: [project("p", `${HOME}/src/app`)],
  });
  const inv = await setup.get();
  assert.ok(inv.mcpServers.some((s) => s.name === "a" && s.scope === "project" && inv.projects[0]!.claude.mcpServerIds.includes(s.id)));
  const node = inv.files[`${HOME}/src/app/.mcp.json`]!;
  assert.notEqual(node.content.type, "markdown");
  assert.equal(JSON.stringify(inv).includes("rawvalue1234"), false);
});

test("a token inside instruction markdown is masked", async () => {
  const { setup } = rig({ files: { [`${HOME}/.claude/CLAUDE.md`]: `Token ${FAKE_GHP_LONG} ok` } });
  const inv = await setup.get();
  const content = inv.files[`${HOME}/.claude/CLAUDE.md`]!.content;
  assert.equal(content.type === "markdown" && content.text, `Token ${MASK} ok`);
});

test("an extensionless import is private, never sent as text", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude/CLAUDE.md`]: "@~/.aws/credentials @~/.kube/config",
      [`${HOME}/.aws/credentials`]: "aws_secret_access_key=REALAWSSECRET99",
      [`${HOME}/.kube/config`]: "token: REALKUBE99",
    },
  });
  const inv = await setup.get();
  assert.equal(JSON.stringify(inv).includes("REALAWSSECRET99") || JSON.stringify(inv).includes("REALKUBE99"), false);
  assert.deepEqual(inv.files[`${HOME}/.aws/credentials`]!.content, { type: "omitted", reason: "private" });
});

test("a skill imported by CLAUDE.md keeps its name, description and tools", async () => {
  const { setup } = rig({
    files: {
      [`${HOME}/.claude/CLAUDE.md`]: "@skills/deploy/SKILL.md",
      [`${HOME}/.claude/skills/deploy/SKILL.md`]: "---\nname: deploy-it\ndescription: Ships it\n---\nBODY",
    },
  });
  const inv = await setup.get();
  const node = inv.files[`${HOME}/.claude/skills/deploy/SKILL.md`]!;
  assert.equal(node.kind, "skill");
  assert.equal(node.name, "deploy-it");
  assert.equal(node.description, "Ships it");
  assert.ok(node.tools.includes("claude"));
});
