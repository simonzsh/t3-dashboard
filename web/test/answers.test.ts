import test from "node:test";
import assert from "node:assert/strict";
import { buildAnswers, canSubmit } from "../src/answers.ts";
import type { UserInputQuestion } from "../../shared/api.ts";

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
