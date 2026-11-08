import { memo, useState } from "react";
import { mediaUrl } from "../../api/client.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";
import { PreviewDialog } from "./AttachmentPreview.tsx";
import { mediaTarget } from "./attachmentPreview.ts";

// Streaming re-renders the whole list: parse a message again only when its text changes.
export const MarkdownText = memo(function MarkdownText({ text, threadId, breaks }: { text: string; threadId: string; breaks?: boolean }) {
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <>
      {renderMarkdown(text, { localMedia: (path) => mediaUrl(threadId, path), onImage: setOpened, breaks })}
      {opened && <PreviewDialog target={mediaTarget(threadId, opened)} onClose={() => setOpened(null)} />}
    </>
  );
});
