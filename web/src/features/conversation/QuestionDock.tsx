import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { PendingRequestDetail } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { answerReady, buildAnswers, shortcutOption, toggleChoice, type Draft, type Drafts } from "./answers.ts";
import { Choice, Icon, IconButton } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

type UserInputRequest = Extract<PendingRequestDetail, { category: "user-input" }>;

/** What the Composer becomes while the agent waits for an answer: its field is the free answer of the current question. */
export interface DockedComposer {
  draft: string;
  onDraft: (text: string) => void;
  onSend: () => Promise<void>;
  allowEmpty: boolean;
  readOnly: boolean;
  placeholder: string;
  submitLabel: string;
  focusKey: string;
}

const EMPTY: Draft = { choices: [], custom: "" };

// A question the agent asks shows above the Composer, one question at a time, as in T3 Code.
export function useQuestionDock(threadId: string, request: UserInputRequest | null, onAnswered: () => Promise<unknown>): { card: ReactNode; composer: DockedComposer | null; onKeyDown: (e: KeyboardEvent) => void } {
  const api = useApi();
  const dismiss = useAction("dismiss the question");
  const [state, setState] = useState<{ requestId: string; index: number; drafts: Drafts; collapsed: boolean } | null>(null);
  if (!request) return { card: null, composer: null, onKeyDown: () => {} };
  const current = state?.requestId === request.requestId ? state : { requestId: request.requestId, index: 0, drafts: {}, collapsed: false };
  const total = request.questions.length;
  const index = Math.min(current.index, total - 1);
  const q = request.questions[index]!;
  const draft = current.drafts[q.id] ?? EMPTY;
  const last = index === total - 1;

  const update = (patch: Partial<typeof current>) => setState({ ...current, ...patch });
  const setDraft = (patch: Partial<Draft>) => update({ drafts: { ...current.drafts, [q.id]: { ...draft, ...patch } } });
  const pick = (value: string) => setDraft({ choices: toggleChoice(q, draft, value) });

  const card = (
    <section className={`question-dock${current.collapsed ? " collapsed" : ""}`} aria-label="Question from the agent">
      <header className="question-dock-head">
        <span className="question-dock-title">{q.header ?? "Question"}</span>
        {total > 1 && <span className="question-dock-count">{`${index + 1}/${total}`}</span>}
        {request.dismissable && (
          <IconButton label="Dismiss the question" tooltip="Dismiss" variant="ghost" size="sm" disabled={dismiss.busy} onClick={() => void dismiss.run(async () => {
            await api.dismiss(threadId, request.requestId);
            await onAnswered();
          })}>
            <Icon name="x" />
          </IconButton>
        )}
        <IconButton label={current.collapsed ? "Show the question" : "Hide the question"} variant="ghost" size="sm" aria-expanded={!current.collapsed} onClick={() => update({ collapsed: !current.collapsed })}>
          <Icon name="chevron" className="icon question-dock-chevron" />
        </IconButton>
      </header>
      {!current.collapsed && (
        <div className="question-dock-body">
          <p className="question-dock-text">
            {q.question}
            {q.required ? " *" : ""}
          </p>
          {q.options.length > 0 && (
            <div className="question-dock-options" role={q.multiSelect ? "group" : "radiogroup"} aria-label={q.question}>
              {q.options.map((o, i) => (
                <label key={o.value} className="question-dock-option">
                  <Choice type={q.multiSelect ? "checkbox" : "radio"} name={`${request.requestId}-${q.id}`} checked={draft.choices.includes(o.value)} onChange={() => pick(o.value)} />
                  <span className="question-dock-label">
                    <strong>{o.label}</strong>
                    {o.description && <small>{o.description}</small>}
                  </span>
                  {i < 9 && <kbd className="question-dock-key">{i + 1}</kbd>}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );

  const composer: DockedComposer = {
    draft: q.allowCustomAnswer ? draft.custom : "",
    onDraft: (text) => q.allowCustomAnswer && setDraft({ custom: text }),
    allowEmpty: answerReady(q, draft),
    readOnly: !q.allowCustomAnswer,
    placeholder: !q.allowCustomAnswer ? "Pick an option above" : q.options.length > 0 ? "Type your own answer, or leave this blank to use the selected option" : "Type your answer",
    submitLabel: last ? "Submit" : "Next",
    focusKey: `${request.requestId}:${index}`,
    onSend: async () => {
      if (!answerReady(q, draft)) return;
      if (!last) return update({ index: index + 1 });
      await api.respond(threadId, request.requestId, { answers: buildAnswers(request.questions, current.drafts) });
      await onAnswered();
    },
  };

  // A digit picks an option while the field is empty: typed text keeps its digits.
  function onKeyDown(e: KeyboardEvent) {
    if (current.collapsed || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement ? target.value !== "" : target.tagName === "INPUT" && (target as HTMLInputElement).type === "text") return;
    const i = shortcutOption(e.key, q.options.length);
    if (i === null) return;
    e.preventDefault();
    pick(q.options[i]!.value);
  }

  return { card, composer, onKeyDown };
}

/** The question the Composer answers: the first user-input request T3 can still take. */
export function dockedRequest(requests: PendingRequestDetail[]): UserInputRequest | null {
  return requests.find((r): r is UserInputRequest => r.category === "user-input" && r.resumable && r.questions.length > 0) ?? null;
}
