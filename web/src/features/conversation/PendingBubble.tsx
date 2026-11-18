import { MarkdownText } from "./MarkdownText.tsx";
import { MessageAttachments } from "./MessageAttachments.tsx";
import { useMessageArrival } from "./messageImpact.ts";
import type { PendingMessage } from "./pending.ts";

export function PendingBubble({ message, threadId }: { message: PendingMessage; threadId: string }) {
  const bubble = useMessageArrival(true);

  return (
    <div className="msg user">
      <div ref={bubble} className="bubble md">
        <MessageAttachments threadId={threadId} attachments={message.attachments} pending />
        {message.text && <MarkdownText threadId={threadId} text={message.text} breaks />}
      </div>
    </div>
  );
}
