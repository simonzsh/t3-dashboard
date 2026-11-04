import type { ChatAttachment } from "../../../../shared/api.ts";
import { rawAttachmentUrl } from "../../api/client.ts";

/** The message text goes after what the user already typed. */
export const mergeDraft = (draft: string, text: string): string => (draft.trim() === "" ? text : text === "" ? draft : `${draft}\n\n${text}`);

// Read before the rewind: T3 may drop the files of a message it rewinds. The composer then uploads them again.
export async function attachmentFiles(threadId: string, attachments: ChatAttachment[], get: (url: string) => Promise<Response> = (url) => fetch(url)): Promise<File[]> {
  return Promise.all(
    attachments.map(async (attachment) => {
      const response = await get(rawAttachmentUrl(threadId, attachment.id));
      if (!response.ok) throw new Error(`Could not read ${attachment.name}.`);
      const blob = await response.blob();
      return new File([blob], attachment.name, { type: attachment.mimeType ?? blob.type });
    }),
  );
}
