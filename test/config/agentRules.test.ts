import assert from "node:assert/strict";
import { test } from "bun:test";
import { AGENT_RULES, RULES_BEGIN, RULES_END, syncAgentRules, withoutRules, withRules } from "../../src/config/agentRules.ts";

const BLOCK = `${RULES_BEGIN}\nold text\n${RULES_END}`;

test("a missing file gets the block alone", () => {
  assert.equal(withRules(null), `${AGENT_RULES}\n`);
});

test("the block is added after one blank line, whether or not the file ends with a newline", () => {
  assert.equal(withRules("@notes.md\nMy rules"), `@notes.md\nMy rules\n\n${AGENT_RULES}\n`);
  assert.equal(withRules("My rules\n"), `My rules\n\n${AGENT_RULES}\n`);
  assert.equal(withRules("My rules\n\n"), `My rules\n\n${AGENT_RULES}\n`);
});

test("an existing block is replaced in place and the text around it stays", () => {
  const before = "@a.md\n# Mine\n\n";
  const after = "\n## Later\n@b.md\n";
  assert.equal(withRules(`${before}${BLOCK}${after}`), `${before}${AGENT_RULES}${after}`);
});

test("the result is stable: a second pass changes nothing", () => {
  const once = withRules("My rules\n");
  assert.equal(withRules(once), once);
});

test("a file with CRLF line ends keeps them", () => {
  const out = withRules("My rules\r\n");
  assert.equal(out, `My rules\r\n\r\n${AGENT_RULES.replaceAll("\n", "\r\n")}\r\n`);
  assert.equal(withRules(out), out);
  assert.equal(withoutRules(out), "My rules\r\n");
});

test("removing the block gives back the original text", () => {
  for (const original of ["My rules\n", "My rules", "@a.md\n\n## Later\n", ""]) {
    const added = withRules(original);
    assert.equal(withoutRules(added), original === "My rules" ? "My rules\n" : original);
  }
  assert.equal(withoutRules("No block\n"), "No block\n");
});

test("a damaged block is refused", () => {
  for (const text of [`a\n${RULES_BEGIN}\nb`, `${RULES_BEGIN}\n${RULES_BEGIN}\n${RULES_END}`, `${RULES_END}\n${RULES_BEGIN}`, `${BLOCK}\n${BLOCK}`]) {
    assert.throws(() => withRules(text), /damaged/);
    assert.throws(() => withoutRules(text), /damaged/);
  }
});

function harness(files: Record<string, string>, env: Record<string, string | undefined> = {}) {
  const writes: string[] = [];
  const logs: string[] = [];
  const deps = {
    env: { CLAUDE_CONFIG_DIR: "/c", CODEX_HOME: "/x", ...env },
    home: "/h",
    exists: (path: string) => path in files,
    readFile: (path: string) => files[path]!,
    writeFile: (path: string, content: string) => {
      writes.push(path);
      files[path] = content;
    },
    log: (message: string) => logs.push(message),
  };
  return { files, writes, logs, deps };
}

test("write creates both files, and a second run writes nothing", () => {
  const { files, writes, deps } = harness({});
  syncAgentRules("write", deps);
  assert.deepEqual(Object.keys(files).sort(), ["/c/CLAUDE.md", "/x/AGENTS.md"]);
  assert.equal(files["/c/CLAUDE.md"], `${AGENT_RULES}\n`);
  writes.length = 0;
  syncAgentRules("write", deps);
  assert.deepEqual(writes, []);
});

test("write does nothing when the opt-out is on, remove ignores it", () => {
  const { files, deps } = harness({ "/c/CLAUDE.md": `Mine\n\n${AGENT_RULES}\n` }, { T3_DASHBOARD_AGENT_RULES: "OFF" });
  syncAgentRules("write", deps);
  assert.deepEqual(Object.keys(files), ["/c/CLAUDE.md"]);
  syncAgentRules("remove", deps);
  assert.equal(files["/c/CLAUDE.md"], "Mine\n");
});

test("remove skips a missing file and keeps a file that is left empty", () => {
  const { files, writes, deps } = harness({ "/c/CLAUDE.md": `${AGENT_RULES}\n` });
  syncAgentRules("remove", deps);
  assert.deepEqual(writes, ["/c/CLAUDE.md"]);
  assert.equal(files["/c/CLAUDE.md"], "");
});

test("a damaged file is left alone and logged, the other file is still updated", () => {
  const damaged = `Mine\n${RULES_BEGIN}\n`;
  const { files, logs, deps } = harness({ "/c/CLAUDE.md": damaged });
  syncAgentRules("write", deps);
  assert.equal(files["/c/CLAUDE.md"], damaged);
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /^Could not update \/c\/CLAUDE\.md: /);
  assert.equal(files["/x/AGENTS.md"], `${AGENT_RULES}\n`);
});

test("a write error is logged and never thrown", () => {
  const { deps, logs } = harness({});
  deps.writeFile = () => {
    throw new Error("read-only");
  };
  syncAgentRules("write", deps);
  assert.deepEqual(logs, ["Could not update /c/CLAUDE.md: read-only", "Could not update /x/AGENTS.md: read-only"]);
});
