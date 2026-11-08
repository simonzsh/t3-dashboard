import assert from "node:assert/strict";
import { test } from "bun:test";
import { monogramColor } from "../../src/lib/monogram.ts";
import { providerMeta, providerRank } from "../../src/lib/providers.ts";

test("providerMeta recognises each driver by a case-insensitive part of its name", () => {
  const kinds: Record<string, string> = {
    claudeAgent: "claude",
    codex: "codex",
    codex_work: "codex",
    Cursor: "cursor",
    grok: "grok",
    opencode: "opencode",
    antigravity: "antigravity",
    gemini: "other",
  };
  for (const [id, kind] of Object.entries(kinds)) assert.equal(providerMeta(id).kind, kind, id);
});

test("providerMeta gives the known providers their label", () => {
  assert.equal(providerMeta("claudeAgent").label, "Claude");
  assert.equal(providerMeta("opencode").label, "OpenCode");
  assert.equal(providerMeta("antigravity").label, "Antigravity");
});

test("providerMeta gives an unknown provider its own name and a stable colour", () => {
  const meta = providerMeta("kiro");
  assert.deepEqual(meta, { kind: "other", label: "kiro", color: monogramColor("kiro") });
  assert.equal(providerMeta("kiro").color, meta.color);
});

test("providerRank puts Codex first, Claude second, known kinds by label, unknown last", () => {
  const ids = ["kiro", "opencode", "claudeAgent", "cursor", "codex", "antigravity", "grok"];
  assert.deepEqual([...ids].sort((a, b) => providerRank(a) - providerRank(b)), ["codex", "claudeAgent", "antigravity", "cursor", "grok", "opencode", "kiro"]);
});
