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
