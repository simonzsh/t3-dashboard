import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { PendingRequestDetail } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { answerReady, buildAnswers, shortcutOption, toggleChoice, type Draft, type Drafts } from "./answers.ts";
import { Chevron, Choice, Icon, IconButton, Kbd } from "../../ui/index.ts";
import { ApprovalButtons } from "./ApprovalButtons.tsx";
import { useAction } from "../../lib/useAction.ts";

type UserInputRequest = Extract<PendingRequestDetail, { category: "user-input" }>;
type ApprovalRequest = Extract<PendingRequestDetail, { category: "approval" }>;

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
          <Chevron open={!current.collapsed} opensUp />
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
                  {i < 9 && <Kbd className="question-dock-key">{i + 1}</Kbd>}
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

/** The request shown on the Composer: the first approval or question T3 can still take. */
export function dockedRequest(requests: PendingRequestDetail[]): UserInputRequest | ApprovalRequest | null {
  const docked = requests.find((r) => r.resumable && (r.category === "approval" || (r.category === "user-input" && r.questions.length > 0)));
  return (docked as UserInputRequest | ApprovalRequest | undefined) ?? null;
}

// An approval sits on the Composer too; the field stays a normal message, queued for after the turn.
export function ApprovalDock({ threadId, request, onAnswered }: { threadId: string; request: ApprovalRequest; onAnswered: () => Promise<unknown> }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className={`question-dock${collapsed ? " collapsed" : ""}`} aria-label="Approval requested by the agent">
      <header className="question-dock-head">
        <span className="question-dock-title">{`Approval requested · ${request.requestKind}`}</span>
        <IconButton label={collapsed ? "Show the request" : "Hide the request"} variant="ghost" size="sm" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <Chevron open={!collapsed} opensUp />
        </IconButton>
      </header>
      {!collapsed && (
        <div className="question-dock-body">
          {request.prompt && <pre className="question-dock-command">{request.prompt}</pre>}
          {request.reason && <p className="question-dock-reason">{request.reason}</p>}
          <div className="question-dock-actions">
            <ApprovalButtons threadId={threadId} requestId={request.requestId} size="sm" onAnswered={onAnswered} />
          </div>
        </div>
      )}
    </section>
  );
}
