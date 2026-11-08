import { useState } from "react";
import type { PendingRequestDetail } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { ApprovalButtons } from "./ApprovalButtons.tsx";
import { buildAnswers, canSubmit, toggleChoice, type Drafts } from "./answers.ts";
import { Button, Choice, TextInput } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

export function PendingRequestView({ threadId, request }: { threadId: string; request: PendingRequestDetail }) {
  const api = useApi();
  const action = useAction("answer the agent");
  const [drafts, setDrafts] = useState<Drafts>({});
  const locked = !request.resumable;

  function setDraft(id: string, patch: Partial<{ choices: string[]; custom: string }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { choices: [], custom: "" }), ...patch } }));
  }

  return (
    <div className="request">
      {request.category === "approval" && (
        <>
          <strong>Approval requested ({request.requestKind})</strong>
          {request.prompt && <div className="msg">{request.prompt}</div>}
          {request.reason && <small>{request.reason}</small>}
          <div className="buttons">
            <ApprovalButtons threadId={threadId} requestId={request.requestId} disabled={locked || action.busy} />
          </div>
        </>
      )}
      {request.category === "user-input" && (
        <>
          {request.questions.map((q) => {
            const d = drafts[q.id];
            return (
              <fieldset className="question" key={q.id} disabled={locked}>
                {q.header && <strong>{q.header}</strong>}
                <span>
                  {q.question}
                  {q.required ? " *" : ""}
                </span>
                {q.options.map((o) => (
                  <label key={o.value}>
                    <Choice
                      type={q.multiSelect ? "checkbox" : "radio"}
                      name={`${request.requestId}-${q.id}`}
                      checked={d?.choices.includes(o.value) ?? false}
                      onChange={() => setDraft(q.id, { choices: toggleChoice(q, d, o.value) })}
                    />
                    <span>
                      {o.label}
                      {o.description && <small> {o.description}</small>}
                    </span>
                  </label>
                ))}
                {q.allowCustomAnswer && <TextInput placeholder="Other answer…" aria-label={`Custom answer: ${q.question}`} value={d?.custom ?? ""} onChange={(e) => setDraft(q.id, { custom: e.target.value })} />}
              </fieldset>
            );
          })}
          <div className="buttons">
            {request.dismissable ? (
              <Button disabled={locked || action.busy} onClick={() => void action.run(() => api.dismiss(threadId, request.requestId))}>
                Dismiss
              </Button>
            ) : (
              <Button disabled={locked || action.busy} onClick={() => void action.run(() => api.interrupt(threadId))}>
                Stop turn
              </Button>
            )}
            <Button
              variant="primary"
              disabled={locked || action.busy || !canSubmit(request.questions, drafts)}
              onClick={() => void action.run(() => api.respond(threadId, request.requestId, { answers: buildAnswers(request.questions, drafts) }))}
            >
              Reply
            </Button>
          </div>
        </>
      )}
      {request.category === "other" && <span>Request of type “{request.requestKind}”: handle it in T3 Code.</span>}
      {locked && <small>Session ended, cannot reply</small>}
    </div>
  );
}
