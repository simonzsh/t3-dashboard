import type { UserInputAnswers, UserInputQuestion } from "../../../../shared/api.ts";

export interface Draft {
  choices: string[];
  custom: string;
}

export type Drafts = Record<string, Draft | undefined>;

function answerOf(q: UserInputQuestion, d: Draft | undefined): string | string[] | null {
  const custom = q.allowCustomAnswer ? (d?.custom.trim() ?? "") : "";
  const choices = d?.choices ?? [];
  if (q.multiSelect) {
    const all = custom ? [...choices, custom] : choices;
    return all.length > 0 ? all : null;
  }
  return custom || choices[0] || null;
}

export function buildAnswers(questions: UserInputQuestion[], drafts: Drafts): UserInputAnswers {
  const out: UserInputAnswers = {};
  for (const q of questions) {
    const a = answerOf(q, drafts[q.id]);
    if (a !== null) out[q.id] = a;
  }
  return out;
}

export function canSubmit(questions: UserInputQuestion[], drafts: Drafts): boolean {
  return questions.every((q) => !q.required || answerOf(q, drafts[q.id]) !== null);
}

/** Next (or Submit) is allowed: the question has an answer, or it is optional. */
export function answerReady(q: UserInputQuestion, d: Draft | undefined): boolean {
  return !q.required || answerOf(q, d) !== null;
}

/** Picks an option: a click or its number key. A radio replaces the choice, a checkbox toggles it. */
export function toggleChoice(q: UserInputQuestion, d: Draft | undefined, value: string): string[] {
  const choices = d?.choices ?? [];
  if (!q.multiSelect) return [value];
  return choices.includes(value) ? choices.filter((v) => v !== value) : [...choices, value];
}

/** The option a digit key picks (1 is the first), or null. */
export function shortcutOption(key: string, count: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const i = Number(key) - 1;
  return i < count ? i : null;
}
