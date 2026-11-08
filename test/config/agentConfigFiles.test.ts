import assert from "node:assert/strict";
import { test } from "bun:test";
import type { JsonValue } from "../../shared/agentSetup.ts";
import { extractImports, localMcpServers, mcpServersOf, parseClaudeSettings, parseCodexConfig, parseFrontmatter, parseHooks, parseJson, parseToml } from "../../src/config/agentConfigFiles.ts";

test("parseJson and parseToml report bad input instead of throwing", () => {
  assert.deepEqual(parseJson('{"a":1}'), { ok: true, value: { a: 1 } });
  assert.deepEqual(parseJson("{nope"), { ok: false });
  assert.deepEqual(parseToml("a = 1\n[t]\nb = 'x'"), { ok: true, value: { a: 1, t: { b: "x" } } });
  assert.deepEqual(parseToml("a = = 1"), { ok: false });
});

test("parseToml turns a datetime into text", () => {
  assert.deepEqual(parseToml("at = 2026-01-02T03:04:05Z"), { ok: true, value: { at: "2026-01-02T03:04:05Z" } });
});

test("parseHooks reads events, matchers and handler kinds", () => {
  const rows = parseHooks({
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "/x/check.sh", args: ["--fast"], timeout: 30 }, { type: "http", url: "https://h.example.com/hook" }] }],
    Stop: [{ hooks: [{ type: "prompt", prompt: "Summarize" }, { type: "mcp_tool", server: "memo", tool: "save" }, { command: "echo" }] }],
    Bad: "nope",
  });
  assert.deepEqual(rows.map((r) => [r.event, r.matcher, r.type, r.target, r.timeoutSec, r.groupIndex, r.handlerIndex]), [
    ["PreToolUse", "Bash", "command", "/x/check.sh --fast", 30, 0, 0],
    ["PreToolUse", "Bash", "http", "https://h.example.com/hook", null, 0, 1],
    ["Stop", null, "prompt", "Summarize", null, 0, 0],
    ["Stop", null, "mcp_tool", "memo/save", null, 0, 1],
    ["Stop", null, "command", "echo", null, 0, 2],
  ]);
  assert.deepEqual(parseHooks(undefined), []);
});

test("parseClaudeSettings keeps hooks and boolean plugin flags, and refuses a non-object", () => {
  const settings = parseClaudeSettings({ hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }] }, enabledPlugins: { "a@m": true, "b@m": false, "c@m": "yes" } });
  assert.deepEqual(settings?.enabledPlugins, { "a@m": true, "b@m": false });
  assert.equal(settings?.hooks.length, 1);
  assert.equal(parseClaudeSettings([]), null);
});

test("MCP server maps come from .mcp.json, .claude.json and its per-project entries", () => {
  const state = { mcpServers: { u: { command: "x" }, bad: 1 }, projects: { "/r": { mcpServers: { l: { url: "https://h" } } }, "/s": {} } };
  assert.deepEqual(Object.keys(mcpServersOf(state)), ["u"]);
  assert.deepEqual(Object.keys(localMcpServers(state, "/r")), ["l"]);
  assert.deepEqual(localMcpServers(state, "/s"), {});
  assert.deepEqual(localMcpServers(state, "/none"), {});
  assert.deepEqual(mcpServersOf("x"), {});
});

test("parseCodexConfig reads servers, trust, fallback names and the size limit", () => {
  const parsed = parseToml(`
project_doc_fallback_filenames = ["TEAM.md", 3]
project_doc_max_bytes = 100
[mcp_servers.a]
command = "npx"
[projects."/r"]
trust_level = "trusted"
[projects."/q"]
other = 1
`);
  assert.equal(parsed.ok, true);
  const config = parseCodexConfig((parsed as { value: JsonValue }).value)!;
  assert.deepEqual(Object.keys(config.mcpServers), ["a"]);
  assert.deepEqual(config.trust, { "/r": "trusted" });
  assert.deepEqual(config.fallbackNames, ["TEAM.md"]);
  assert.equal(config.maxBytes, 100);
  assert.equal(parseCodexConfig([]), null);
});

test("parseFrontmatter reads top-level fields and folded values", () => {
  const fields = parseFrontmatter("---\nname: review\ndescription: >-\n  Reviews a diff\n  for bugs\nmodel: 'opus'\npaths:\n  - a/**\n---\nbody: not a field\n");
  assert.deepEqual(fields, { name: "review", description: "Reviews a diff for bugs", model: "opus", paths: "" });
  assert.deepEqual(parseFrontmatter("no fence\nname: x"), {});
  assert.deepEqual(parseFrontmatter("---\nname: cut"), { name: "cut" });
});

test("extractImports keeps path-shaped @ lines outside code", () => {
  const md = [
    "See @AGENTS.md and @./docs/a.md, also @~/notes/b.md.",
    "Package @types/node and mail me@host.com stay out.",
    "Inline `@skipped.md` is code.",
    "```",
    "@fenced.md",
    "```",
    "@/abs/rules.md",
    "@dir/with\\ space.md",
    "@AGENTS.md",
  ].join("\n");
  assert.deepEqual(extractImports(md), ["AGENTS.md", "./docs/a.md", "~/notes/b.md", "/abs/rules.md", "dir/with space.md"]);
});

test("extractImports ignores @mentions that are not paths", () => {
  assert.deepEqual(extractImports("ping @john.doe and @Next.js and @types/node, see @notes.md, @./a.json, @cfg.toml"), ["notes.md", "./a.json", "cfg.toml"]);
});
