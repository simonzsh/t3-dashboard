import { useLayoutEffect, useRef } from "react";
import { enter } from "../../ui/index.ts";
import { MarkdownText } from "./MarkdownText.tsx";
import { MessageAttachments } from "./MessageAttachments.tsx";
import { playMessageImpact } from "./messageImpact.ts";
import type { PendingMessage } from "./pending.ts";

export function PendingBubble({ message, threadId }: { message: PendingMessage; threadId: string }) {
  const bubble = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = bubble.current;
    let active = true;
    let animation: Animation | null = null;
    // Let the message list scroll to the new bubble before measuring its impact.
    queueMicrotask(() => {
      if (!active || !element?.isConnected) return;
      playMessageImpact(element);
      animation = enter(element, { y: 8, scale: 0.94, spring: true });
    });
    return () => {
      active = false;
      animation?.cancel();
    };
  }, []);

  return (
    <div className="msg user">
      <div ref={bubble} className="bubble md message-arrival">
        <MessageAttachments threadId={threadId} attachments={message.attachments} pending />
        {message.text && <MarkdownText threadId={threadId} text={message.text} breaks />}
      </div>
    </div>
  );
}
