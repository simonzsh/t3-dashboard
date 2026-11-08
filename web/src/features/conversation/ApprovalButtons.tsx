import { useState } from "react";
import type { ApprovalDecision } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Button, type ControlSize } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

// The primary action comes last, on the right, as in the dialogs.
const DECISIONS: Array<[ApprovalDecision, string]> = [
  ["decline", "Decline"],
  ["acceptForSession", "Accept for session"],
  ["accept", "Accept"],
];

interface Props {
  threadId: string;
  requestId: string;
  size?: ControlSize;
  disabled?: boolean;
  /** Runs after T3 took the decision. */
  onAnswered?: () => Promise<unknown>;
}

/** The three answers to an approval request; the pressed one shows a spinner and all wait while it runs. */
export function ApprovalButtons({ threadId, requestId, size, disabled = false, onAnswered }: Props) {
  const api = useApi();
  const action = useAction("answer the agent");
  const [busy, setBusy] = useState<ApprovalDecision | null>(null);
  return (
    <>
      {DECISIONS.map(([decision, label]) => (
        <Button
          key={decision}
          size={size}
          variant={decision === "accept" ? "primary" : undefined}
          loading={busy === decision}
          disabled={disabled || busy !== null}
          onClick={() =>
            void action.run(async () => {
              await api.respond(threadId, requestId, { decision });
              await onAnswered?.();
            }, (on) => setBusy(on ? decision : null))
          }
        >
          {label}
        </Button>
      ))}
    </>
  );
}
