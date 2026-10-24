import { useState } from "react";
import type { ApprovalDecision, PendingRequestDetail } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { buildAnswers, canSubmit, type Drafts } from "../answers.ts";
import { useAction } from "./useAction.ts";

const DECISIONS: Array<[ApprovalDecision, string]> = [
  ["accept", "Accepter"],
  ["acceptForSession", "Accepter pour la session"],
  ["decline", "Refuser"],
];

export function PendingRequestView({ threadId, request }: { threadId: string; request: PendingRequestDetail }) {
  const action = useAction();
  const [drafts, setDrafts] = useState<Drafts>({});
  const locked = !request.resumable;

  function setDraft(id: string, patch: Partial<{ choices: string[]; custom: string }>) {
    const cur = drafts[id] ?? { choices: [], custom: "" };
    setDrafts({ ...drafts, [id]: { ...cur, ...patch } });
  }

  return (
    <div className="request">
      {request.category === "approval" && (
        <>
          <strong>Approbation demandée ({request.requestKind})</strong>
          {request.prompt && <div className="msg">{request.prompt}</div>}
          {request.reason && <small>{request.reason}</small>}
          <div className="buttons">
            {DECISIONS.map(([decision, label]) => (
              <button key={decision} disabled={locked || action.busy} onClick={() => void action.run(() => api.respond(threadId, request.requestId, { decision }))}>
                {label}
              </button>
            ))}
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
                    <input
                      type={q.multiSelect ? "checkbox" : "radio"}
                      name={`${request.requestId}-${q.id}`}
                      checked={d?.choices.includes(o.value) ?? false}
                      onChange={(e) =>
                        setDraft(q.id, {
                          choices: q.multiSelect
                            ? e.target.checked
                              ? [...(d?.choices ?? []), o.value]
                              : (d?.choices ?? []).filter((v) => v !== o.value)
                            : [o.value],
                        })
                      }
                    />
                    <span>
                      {o.label}
                      {o.description && <small> {o.description}</small>}
                    </span>
                  </label>
                ))}
                {q.allowCustomAnswer && <input type="text" placeholder="Autre réponse…" aria-label={`Réponse libre : ${q.question}`} value={d?.custom ?? ""} onChange={(e) => setDraft(q.id, { custom: e.target.value })} />}
              </fieldset>
            );
          })}
          <div className="buttons">
            <button
              className="primary"
              disabled={locked || action.busy || !canSubmit(request.questions, drafts)}
              onClick={() => void action.run(() => api.respond(threadId, request.requestId, { answers: buildAnswers(request.questions, drafts) }))}
            >
              Répondre
            </button>
            <button disabled={locked || action.busy} onClick={() => void action.run(() => api.dismiss(threadId, request.requestId))}>
              Ignorer
            </button>
          </div>
        </>
      )}
      {request.category === "other" && <span>Demande de type « {request.requestKind} » : à traiter dans T3 Code.</span>}
      {locked && <small>Session terminée, réponse impossible</small>}
      {action.error && <span className="error">{action.error}</span>}
    </div>
  );
}
