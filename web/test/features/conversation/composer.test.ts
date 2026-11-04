import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardProvider } from "../../../../shared/api.ts";
import { MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "../../../../shared/limits.ts";
import { acceptFiles, applyTrigger, attachmentType, composerPlaceholder, currentEffort, dropTrigger, escapeBlurs, filterCommands, filterSkills, findModel, formatTokens, isSendKey, selectEffort, selectModel, suggestsCompact, triggerAt } from "../../../src/features/conversation/composer.ts";

const effort = (optionId: string, ids: string[], defaultLevel: string | null) => ({ optionId, label: "Reasoning", levels: ids.map((id) => ({ id, label: id.toUpperCase() })), defaultLevel });
const providers: DashboardProvider[] = [
  {
    instanceId: "claudeAgent",
    displayName: "Claude",
    runtimeModes: ["approval-required", "full-access"],
    models: [
      { slug: "opus", name: "Opus", effort: effort("effort", ["low", "medium", "high", "max"], "medium"), speed: { optionId: "fastMode", fast: true, standard: false, defaultFast: false }, favorite: null },
      { slug: "haiku", name: "Haiku", effort: null, speed: null, favorite: null },
    ],
  },
  { instanceId: "codex", displayName: "Codex", runtimeModes: ["full-access"], models: [{ slug: "gpt", name: "GPT", effort: effort("reasoningEffort", ["low", "high"], "high"), speed: null, favorite: null }] },
];

test("findModel locates the provider and model of a selection", () => {
  const found = findModel(providers, { instanceId: "codex", model: "gpt" });
  assert.equal(found?.provider.displayName, "Codex");
  assert.equal(found?.model.name, "GPT");
  assert.equal(findModel(providers, { instanceId: "codex", model: "gone" }), null);
  assert.equal(findModel(providers, null), null);
});

test("currentEffort reads the option, else the model default", () => {
  const opus = providers[0]!.models[0]!;
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "high" }] }, opus), "high");
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "opus" }, opus), "medium");
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "ultra" }] }, opus), "medium");
  assert.equal(currentEffort({ instanceId: "claudeAgent", model: "haiku" }, providers[0]!.models[1]!), null);
});

test("selectEffort replaces only the effort option", () => {
  const opus = providers[0]!.models[0]!;
  const before = { instanceId: "claudeAgent", model: "opus", options: [{ id: "fastMode", value: false }, { id: "effort", value: "low" }] };
  assert.deepEqual(selectEffort(before, opus, "max"), { instanceId: "claudeAgent", model: "opus", options: [{ id: "fastMode", value: false }, { id: "effort", value: "max" }] });
});

test("selectModel keeps the effort only when the new model accepts it", () => {
  const from = { instanceId: "claudeAgent", model: "opus", options: [{ id: "effort", value: "high" }, { id: "fastMode", value: true }] };
  assert.deepEqual(selectModel(from, providers[1]!, providers[1]!.models[0]!), { instanceId: "codex", model: "gpt", options: [{ id: "reasoningEffort", value: "high" }] });
  assert.deepEqual(selectModel({ ...from, options: [{ id: "effort", value: "max" }] }, providers[1]!, providers[1]!.models[0]!), { instanceId: "codex", model: "gpt" });
  assert.deepEqual(selectModel(from, providers[0]!, providers[0]!.models[1]!), { instanceId: "claudeAgent", model: "haiku" });
  assert.deepEqual(selectModel(null, providers[0]!, providers[0]!.models[0]!), { instanceId: "claudeAgent", model: "opus" });
});

const file = (name: string, type: string, size: number) => ({ name, type, size });
const names = (r: { accepted: Array<{ name: string }> }) => r.accepted.map((f) => f.name);

test("attachmentType sends an image type as an image and anything else as a file", () => {
  assert.equal(attachmentType({ type: "image/png" }), "image");
  assert.equal(attachmentType({ type: "image/webp" }), "image");
  assert.equal(attachmentType({ type: "image/svg+xml" }), "file");
  assert.equal(attachmentType({ type: "application/pdf" }), "file");
  assert.equal(attachmentType({ type: "" }), "file");
});

test("acceptFiles takes images and other files up to the T3 limits", () => {
  const ok = acceptFiles([], [file("a.png", "image/png", 10), file("b.pdf", "application/pdf", MAX_FILE_BYTES), file("c", "", 1)]);
  assert.deepEqual([names(ok), ok.error], [["a.png", "b.pdf", "c"], null]);
});

test("acceptFiles refuses an empty file, a big image and a big file, and says which", () => {
  const empty = acceptFiles([], [file("e.txt", "text/plain", 0)]);
  assert.deepEqual([names(empty), empty.error], [[], "e.txt: the file is empty."]);
  const image = acceptFiles([], [file("b.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1), file("ok.jpg", "image/jpeg", MAX_IMAGE_BYTES)]);
  assert.deepEqual([names(image), image.error], [["ok.jpg"], "b.jpg: images must be 10 MB or less."]);
  const big = acceptFiles([], [file("v.mov", "video/quicktime", MAX_FILE_BYTES + 1)]);
  assert.deepEqual([names(big), big.error], [[], "v.mov: files must be 50 MB or less."]);
});

test("acceptFiles counts what is already attached", () => {
  const full = acceptFiles(Array.from({ length: MAX_ATTACHMENTS - 1 }, () => file("x", "text/plain", 1)), [file("a.txt", "text/plain", 1), file("b.txt", "text/plain", 1)]);
  assert.deepEqual([names(full), full.error], [["a.txt"], `Up to ${MAX_ATTACHMENTS} files per message.`]);
  const existing = Array.from({ length: 8 }, () => file("i.png", "image/png", MAX_IMAGE_BYTES));
  const heavy = acceptFiles(existing, [file("a.png", "image/png", MAX_IMAGE_BYTES), file("p.pdf", "application/pdf", MAX_IMAGE_BYTES)]);
  assert.deepEqual([names(heavy), heavy.error], [["p.pdf"], "Images can total up to 80 MB per message."]);
});

test("triggerAt finds an @ word at the start or after whitespace", () => {
  assert.deepEqual(triggerAt("@src", 4), { kind: "mention", start: 0, query: "src" });
  assert.deepEqual(triggerAt("look at @src/ap", 15), { kind: "mention", start: 8, query: "src/ap" });
  assert.deepEqual(triggerAt("a\n@", 3), { kind: "mention", start: 2, query: "" });
  assert.deepEqual(triggerAt("see @src and more", 8), { kind: "mention", start: 4, query: "src" });
});

test("triggerAt ignores an @ inside a word, an email and a finished mention", () => {
  assert.equal(triggerAt("mail me@example.com", 19), null);
  assert.equal(triggerAt("word@", 5), null);
  assert.equal(triggerAt("@src ", 5), null);
  assert.equal(triggerAt("no mention", 10), null);
  assert.equal(triggerAt("", 0), null);
});

test("triggerAt opens the command menu for a / at the very start only", () => {
  assert.deepEqual(triggerAt("/", 1), { kind: "command", start: 0, query: "" });
  assert.deepEqual(triggerAt("/comp", 5), { kind: "command", start: 0, query: "comp" });
  assert.equal(triggerAt("run /compact", 12), null);
  assert.equal(triggerAt("\n/compact", 9), null);
  assert.equal(triggerAt("/usr/bin", 8), null);
  assert.equal(triggerAt("/compact now", 12), null);
});

test("triggerAt opens the skill menu for a $ word, but not for a price", () => {
  assert.deepEqual(triggerAt("$", 1), { kind: "skill", start: 0, query: "" });
  assert.deepEqual(triggerAt("use $plug:rev", 13), { kind: "skill", start: 4, query: "plug:rev" });
  assert.deepEqual(triggerAt("a\n$a-b_c", 8), { kind: "skill", start: 2, query: "a-b_c" });
  assert.equal(triggerAt("it costs $5", 11), null);
  assert.equal(triggerAt("cost $5.99", 10), null);
  assert.equal(triggerAt("a$b", 3), null);
  assert.equal(triggerAt("$a b", 4), null);
});

test("applyTrigger swaps the typed word for the replacement and a space, with the caret after it", () => {
  const typed = "look at @src and more";
  const trigger = triggerAt(typed, 12)!;
  assert.deepEqual(applyTrigger(typed, trigger, "@src/app.ts"), { text: "look at @src/app.ts and more", caret: 20 });
  assert.deepEqual(applyTrigger("@", { kind: "mention", start: 0, query: "" }, "@a b.txt"), { text: "@a b.txt ", caret: 9 });
  assert.deepEqual(applyTrigger("use $re", triggerAt("use $re", 7)!, "$review"), { text: "use $review ", caret: 12 });
});

const commands = [
  { name: "compact", description: "Summarize the conversation" },
  { name: "review", description: "Review a pull request" },
  { name: "init", description: "Create a CLAUDE.md file" },
  { name: "goal", description: null },
];

test("filterCommands ranks a name prefix before a name or description match", () => {
  assert.deepEqual(filterCommands(commands, "").map((c) => c.name), ["compact", "review", "init", "goal"]);
  assert.deepEqual(filterCommands(commands, "re").map((c) => c.name), ["review", "init"]);
  assert.deepEqual(filterCommands(commands, "CLAUDE").map((c) => c.name), ["init"]);
  assert.deepEqual(filterCommands(commands, "view").map((c) => c.name), ["review"]);
  assert.deepEqual(filterCommands(commands, "zzz"), []);
});

test("filterCommands drops compact when asked to", () => {
  assert.deepEqual(filterCommands(commands, "", { compact: false }).map((c) => c.name), ["review", "init", "goal"]);
});

test("filterSkills matches the name, the display name and the description, name prefixes first", () => {
  const skills = [
    { name: "plug:deploy", displayName: "Deploy", description: "Ship a release" },
    { name: "plug:review", displayName: "Code Review", description: "Review code" },
    { name: "review-pr", displayName: null, description: null },
  ];
  assert.deepEqual(filterSkills(skills, "").map((k) => k.name), ["plug:deploy", "plug:review", "review-pr"]);
  assert.deepEqual(filterSkills(skills, "review").map((k) => k.name), ["review-pr", "plug:review"]);
  assert.deepEqual(filterSkills(skills, "ship").map((k) => k.name), ["plug:deploy"]);
  assert.deepEqual(filterSkills(skills, "code rev").map((k) => k.name), ["plug:review"]);
});

test("formatTokens shortens a count the way T3 Code's Compact button does", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(1_500), "1.5k");
  assert.equal(formatTokens(9_999), "10k");
  assert.equal(formatTokens(39_658), "40k");
  assert.equal(formatTokens(722_300), "722k");
  assert.equal(formatTokens(999_600), "1M");
  assert.equal(formatTokens(1_250_000), "1.3M");
});

test("isSendKey: Enter sends, Shift+Enter, composition and touch keyboards do not", () => {
  const key = { key: "Enter", shiftKey: false, isComposing: false };
  assert.equal(isSendKey(key, false), true);
  assert.equal(isSendKey({ ...key, shiftKey: true }, false), false);
  assert.equal(isSendKey({ ...key, isComposing: true }, false), false);
  assert.equal(isSendKey(key, true), false);
  assert.equal(isSendKey({ ...key, key: "a" }, false), false);
});

test("dropTrigger removes the typed word and the space after it", () => {
  assert.deepEqual(dropTrigger("/comp now", { kind: "command", start: 0, query: "comp" }), { text: "now", caret: 0 });
  assert.deepEqual(dropTrigger("/", { kind: "command", start: 0, query: "" }), { text: "", caret: 0 });
  assert.deepEqual(dropTrigger("a $b", { kind: "skill", start: 2, query: "b" }), { text: "a ", caret: 2 });
});

test("composerPlaceholder names the menus the composer has, and queues while a run is active", () => {
  const all = ["@ files", "$ skills", "/ commands"];
  assert.equal(composerPlaceholder(false, all), "Ask anything. @ files, $ skills, / commands");
  assert.equal(composerPlaceholder(true, all), "Queue a message for the agent. @ files, $ skills, / commands");
  assert.equal(composerPlaceholder(false, ["@ files"]), "Ask anything. @ files");
  assert.equal(composerPlaceholder(false, []), "Send a message to the agent…");
  assert.equal(composerPlaceholder(true, []), "Queue a message for the agent…");
});

test("escapeBlurs only for a plain Escape with no menu open and no IME composition", () => {
  const key = { key: "Escape", isComposing: false };
  assert.equal(escapeBlurs(key, false), true);
  assert.equal(escapeBlurs(key, true), false);
  assert.equal(escapeBlurs({ ...key, isComposing: true }, false), false);
  assert.equal(escapeBlurs({ ...key, key: "Enter" }, false), false);
});

test("Compact shows like T3 Code: Claude, 200k tokens or more, prompt cache expired", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const usage = (usedTokens: number, minutesAgo: number, promptCacheTtlMs: number | null = null) => ({ usedTokens, maxTokens: 1_000_000, updatedAt: new Date(now - minutesAgo * 60_000).toISOString(), promptCacheTtlMs });
  assert.equal(suggestsCompact("claudeAgent", usage(250_000, 70), now), true);
  assert.equal(suggestsCompact("claudeAgent", usage(250_000, 69), now), false, "cache still warm");
  assert.equal(suggestsCompact("claudeAgent", usage(199_999, 120), now), false, "under 200k");
  assert.equal(suggestsCompact("codex", usage(500_000, 120), now), false, "not Claude");
  assert.equal(suggestsCompact(undefined, usage(500_000, 120), now), false);
  assert.equal(suggestsCompact("claudeAgent", usage(250_000, 6, 300_000), now), true, "the provider's own TTL");
  assert.equal(suggestsCompact("claudeAgent", { ...usage(250_000, 120), updatedAt: null }, now), false);
  assert.equal(suggestsCompact("claudeAgent", null, now), false);
});
