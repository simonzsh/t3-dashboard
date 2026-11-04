import type { ChatAttachment } from "../../../../shared/api.ts";
import { attachmentUrl, inlineAttachmentUrl, mediaUrl, rawAttachmentUrl } from "../../api/client.ts";

export type PreviewKind = "image" | "pdf" | "html" | "text" | "other";

/** What the preview dialog shows: `src` is framed, `open` goes in a new tab, `download` saves the bytes. */
export interface PreviewTarget {
  name: string;
  kind: Exclude<PreviewKind, "other">;
  src: string;
  open: string;
  download: string;
}

// PDF and text go by type only: the server frames them by the type T3 answers, and downloads anything else.
export function previewKind({ name, mimeType, kind }: Pick<ChatAttachment, "name" | "mimeType" | "kind">): PreviewKind {
  const type = (mimeType ?? "").toLowerCase();
  if (kind === "image" || type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type === "text/html" || /\.html?$/i.test(name)) return "html";
  if (type.startsWith("text/") || type === "application/json") return "text";
  return "other";
}

/** Null when the file has no preview: its chip downloads it. */
export function attachmentTarget(threadId: string, file: ChatAttachment, theme: string): PreviewTarget | null {
  const kind = previewKind(file);
  if (kind === "other") return null;
  const src = kind === "html" ? attachmentUrl(threadId, file.id, theme) : kind === "image" ? attachmentUrl(threadId, file.id) : inlineAttachmentUrl(threadId, file.id);
  return { name: file.name, kind, src, open: src, download: rawAttachmentUrl(threadId, file.id) };
}

export function mediaTarget(threadId: string, path: string): PreviewTarget {
  const src = mediaUrl(threadId, path);
  return { name: path.split("/").pop() || path, kind: "image", src, open: src, download: src };
}
