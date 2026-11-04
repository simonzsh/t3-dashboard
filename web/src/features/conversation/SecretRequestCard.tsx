import { useState } from "react";
import type { TurnStep } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useAction } from "../../lib/useAction.ts";
import { Button, Icon, SecretInput } from "../../ui/index.ts";
import { SECRET_STATUS_LABELS, saveBody } from "./secretRequest.ts";

/** The agent asks for a secret. The value goes straight to T3: it stays in this field only until the send. */
export function SecretRequestCard({ step, threadId }: { step: TurnStep; threadId: string }) {
  const api = useApi();
  const action = useAction("send the secret");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const request = step.secret;
  if (!request) return null;
  const pending = request.status === "pending";
  const body = saveBody(value);

  async function answer(answerBody: NonNullable<ReturnType<typeof saveBody>>) {
    const ok = await action.run(() => api.answerSecret(threadId, step.id, answerBody));
    setValue("");
    if (ok) setSent(true);
  }

  return (
    <section className="request secret-card">
      <header>
        <Icon name="lock" />
        <strong>{request.label}</strong>
        {!pending && <span className="secret-status">{SECRET_STATUS_LABELS[request.status as keyof typeof SECRET_STATUS_LABELS]}</span>}
      </header>
      {request.reason && <div className="msg">{request.reason}</div>}
      {pending && (
        <form
          autoComplete="off"
          className="key-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (body && !sent && !action.busy) void answer(body);
          }}
        >
          <SecretInput aria-label={request.label} placeholder={request.placeholder ?? ""} value={value} disabled={sent} onChange={(e) => setValue(e.target.value)} />
          <Button type="button" disabled={sent || action.busy} onClick={() => void answer({ decline: true })}>
            Decline
          </Button>
          <Button variant="primary" type="submit" disabled={body === null || sent || action.busy}>
            Save
          </Button>
        </form>
      )}
      {action.error && <p className="step-error">{action.error}</p>}
    </section>
  );
}
