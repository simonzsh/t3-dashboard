import { ActivityRow } from "./ActivityRow.tsx";
import { PendingBubble } from "./PendingBubble.tsx";
import type { PendingMessage } from "./pending.ts";

export function TurnStart({ pending, threadId, thinking }: { pending: PendingMessage[]; threadId: string; thinking: boolean }) {
  return (
    <>
      {pending.map((message) => <PendingBubble key={message.id} message={message} threadId={threadId} />)}
      {thinking && <ActivityRow activity="thinking" />}
    </>
  );
}
