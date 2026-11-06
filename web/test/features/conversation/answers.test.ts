import { test } from "bun:test";
import assert from "node:assert/strict";
import { answerReady, buildAnswers, canSubmit, shortcutOption, toggleChoice } from "../../../src/features/conversation/answers.ts";
import type { UserInputQuestion } from "../../../../shared/api.ts";

function q(id: string, over: Partial<UserInputQuestion> = {}): UserInputQuestion {
  return { id, header: null, question: `Question ${id}`, options: [], multiSelect: false, allowCustomAnswer: false, required: false, ...over };
}

test("single choice gives a string, free text replaces it", () => {
  const qs = [q("a"), q("b", { allowCustomAnswer: true })];
  const out = buildAnswers(qs, { a: { choices: ["x"], custom: "ignored" }, b: { choices: ["y"], custom: " mon texte " } });
  assert.deepEqual(out, { a: "x", b: "mon texte" });
});

test("multi select gives an array and appends free text", () => {
  const qs = [q("a", { multiSelect: true, allowCustomAnswer: true })];
  assert.deepEqual(buildAnswers(qs, { a: { choices: ["x", "y"], custom: "" } }), { a: ["x", "y"] });
  assert.deepEqual(buildAnswers(qs, { a: { choices: ["x"], custom: "z" } }), { a: ["x", "z"] });
});

test("unanswered questions are left out", () => {
  assert.deepEqual(buildAnswers([q("a"), q("b")], { a: { choices: [], custom: "" } }), {});
});

test("canSubmit needs every required question answered", () => {
  const qs = [q("a", { required: true }), q("b")];
  assert.equal(canSubmit(qs, {}), false);
  assert.equal(canSubmit(qs, { a: { choices: ["x"], custom: "" } }), true);
  assert.equal(canSubmit([q("c", { required: true, allowCustomAnswer: true })], { c: { choices: [], custom: "  " } }), false);
});

test("answerReady lets an optional question through and needs an answer for a required one", () => {
  assert.equal(answerReady(q("a"), undefined), true);
  assert.equal(answerReady(q("a", { required: true }), undefined), false);
  assert.equal(answerReady(q("a", { required: true }), { choices: ["x"], custom: "" }), true);
  assert.equal(answerReady(q("a", { required: true, allowCustomAnswer: true }), { choices: [], custom: "mine" }), true);
});

test("toggleChoice replaces a radio choice and toggles a checkbox", () => {
  assert.deepEqual(toggleChoice(q("a"), { choices: ["x"], custom: "" }, "y"), ["y"]);
  const multi = q("a", { multiSelect: true });
  assert.deepEqual(toggleChoice(multi, { choices: ["x"], custom: "" }, "y"), ["x", "y"]);
  assert.deepEqual(toggleChoice(multi, { choices: ["x", "y"], custom: "" }, "x"), ["y"]);
});

test("shortcutOption maps 1-9 to an existing option only", () => {
  assert.equal(shortcutOption("1", 3), 0);
  assert.equal(shortcutOption("3", 3), 2);
  assert.equal(shortcutOption("4", 3), null);
  assert.equal(shortcutOption("0", 3), null);
  assert.equal(shortcutOption("a", 3), null);
});
