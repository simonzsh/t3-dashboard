import { memo } from "react";
import { mediaUrl } from "../../api/client.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";

// Streaming re-renders the whole list: parse a message again only when its text changes.
export const MarkdownText = memo(function MarkdownText({ text, threadId, breaks }: { text: string; threadId: string; breaks?: boolean }) {
  return renderMarkdown(text, { localMedia: (path) => mediaUrl(threadId, path), breaks });
});
