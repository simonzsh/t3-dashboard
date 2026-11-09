import { memo, useState } from "react";
import { highlightText } from "../../lib/highlightText.tsx";
import { mediaUrl } from "../../api/client.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";
import { PreviewDialog } from "./AttachmentPreview.tsx";
import { mediaTarget } from "./attachmentPreview.ts";

// Streaming re-renders the whole list: parse a message again only when its text changes.
export const MarkdownText = memo(function MarkdownText({ text, threadId, breaks, query = "" }: { text: string; threadId: string; breaks?: boolean; query?: string }) {
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <>
      {highlightText(renderMarkdown(text, { localMedia: (path) => mediaUrl(threadId, path), onImage: setOpened, breaks }), query)}
      {opened && <PreviewDialog target={mediaTarget(threadId, opened)} onClose={() => setOpened(null)} />}
    </>
  );
});
