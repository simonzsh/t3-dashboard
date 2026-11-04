import { useState } from "react";
import type { ChatAttachment } from "../../../../shared/api.ts";
import { attachmentUrl, rawAttachmentUrl } from "../../api/client.ts";
import { formatBytes } from "../../lib/format.ts";
import { useDocumentTheme } from "../../lib/useDocumentTheme.ts";
import { Icon, Pressable } from "../../ui/index.ts";
import { AttachmentPreview } from "./AttachmentPreview.tsx";
import { attachmentTarget, type PreviewTarget } from "./attachmentPreview.ts";

/** The images and files of a message. A click opens the preview; a file with no preview downloads. */
export function MessageAttachments({ threadId, attachments }: { threadId: string; attachments: ChatAttachment[] }) {
  const [open, setOpen] = useState<PreviewTarget | null>(null);
  const theme = useDocumentTheme();
  const images = attachments.filter((file) => file.kind === "image");
  const files = attachments.filter((file) => file.kind === "file");
  if (attachments.length === 0) return null;
  return (
    <div className="msg-attachments">
      {images.length > 0 && (
        <div className="msg-images">
          {images.map((file) => (
            <Pressable key={file.id} className="msg-thumb" onClick={() => setOpen(attachmentTarget(threadId, file, theme))}>
              <img src={attachmentUrl(threadId, file.id)} alt={file.name} loading="lazy" />
            </Pressable>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="msg-files">
          {files.map((file) => {
            const target = attachmentTarget(threadId, file, theme);
            const content = (
              <>
                <Icon name="paperclip" />
                <span className="msg-file-name">{file.name}</span>
                {file.sizeBytes !== null && <span className="msg-file-size">{formatBytes(file.sizeBytes)}</span>}
              </>
            );
            return target ? (
              <Pressable key={file.id} className="msg-file" onClick={() => setOpen(target)}>
                {content}
              </Pressable>
            ) : (
              <a key={file.id} className="msg-file" href={rawAttachmentUrl(threadId, file.id)} download={file.name}>
                {content}
              </a>
            );
          })}
        </div>
      )}
      {open && <AttachmentPreview target={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
