import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardProvider } from "../../../../shared/api.ts";
import { MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "../../../../shared/limits.ts";
import { acceptFiles, applyMention, attachmentType, currentEffort, findModel, isSendKey, mentionAt, selectEffort, selectModel } from "../../../src/features/conversation/composer.ts";

const effort = (optionId: string, ids: string[], defaultLevel: string | null) => ({ optionId, levels: ids.map((id) => ({ id, label: id.toUpperCase() })), defaultLevel });
const providers: DashboardProvider[] = [
  {
    instanceId: "claudeAgent",
    displayName: "Claude",
    runtimeModes: ["approval-required", "full-access"],
    models: [
      { slug: "opus", name: "Opus", effort: effort("effort", ["low", "medium", "high", "max"], "medium"), favorite: null },
      { slug: "haiku", name: "Haiku", effort: null, favorite: null },
    ],
  },
  { instanceId: "codex", displayName: "Codex", runtimeModes: ["full-access"], models: [{ slug: "gpt", name: "GPT", effort: effort("reasoningEffort", ["low", "high"], "high"), favorite: null }] },
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

test("mentionAt finds an @ word at the start or after whitespace", () => {
  assert.deepEqual(mentionAt("@src", 4), { start: 0, query: "src" });
  assert.deepEqual(mentionAt("look at @src/ap", 15), { start: 8, query: "src/ap" });
  assert.deepEqual(mentionAt("a\n@", 3), { start: 2, query: "" });
  assert.deepEqual(mentionAt("see @src and more", 8), { start: 4, query: "src" });
});

test("mentionAt ignores an @ inside a word, an email and a finished mention", () => {
  assert.equal(mentionAt("mail me@example.com", 19), null);
  assert.equal(mentionAt("word@", 5), null);
  assert.equal(mentionAt("@src ", 5), null);
  assert.equal(mentionAt("no mention", 10), null);
  assert.equal(mentionAt("", 0), null);
});

test("applyMention swaps the typed word for @path and a space, with the caret after it", () => {
  const typed = "look at @sr and more";
  const mention = mentionAt(typed, 11)!;
  assert.deepEqual(applyMention(typed, mention, "src/app.ts"), { text: "look at @src/app.ts and more", caret: 20 });
  assert.deepEqual(applyMention("@", { start: 0, query: "" }, "a b.txt"), { text: "@a b.txt ", caret: 9 });
});

test("isSendKey: Enter sends, Shift+Enter, composition and touch keyboards do not", () => {
  const key = { key: "Enter", shiftKey: false, isComposing: false };
  assert.equal(isSendKey(key, false), true);
  assert.equal(isSendKey({ ...key, shiftKey: true }, false), false);
  assert.equal(isSendKey({ ...key, isComposing: true }, false), false);
  assert.equal(isSendKey(key, true), false);
  assert.equal(isSendKey({ ...key, key: "a" }, false), false);
});
