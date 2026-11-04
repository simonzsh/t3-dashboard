import type { UploadedAttachment } from "../../../../shared/api.ts";
import { MAX_ATTACHMENTS } from "../../../../shared/limits.ts";
import { STASH_LIMIT, type StashEntry } from "../../../../shared/stash.ts";
import { liveUploads } from "../../../../shared/stash.ts";

interface KeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
}

/** Ctrl+S, plus Cmd+S on a Mac as in T3 Code. Ctrl+S has no browser meaning on a Mac. */
export function isStashKey(e: KeyEvent, mac: boolean): boolean {
  return e.key.toLowerCase() === "s" && (mac ? e.metaKey !== e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey && !e.isComposing;
}

/** What a restore puts back, and what it leaves out with the reason. */
export function planRestore(entry: StashEntry, taken: number, now: Date): { uploads: UploadedAttachment[]; notes: string[] } {
  const { uploads: live, expired } = liveUploads(entry, now);
  const room = Math.max(0, MAX_ATTACHMENTS - taken);
  const uploads = live.slice(0, room);
  const notes: string[] = [];
  if (expired.length > 0) notes.push(`${expired.join(", ")} could not be restored: T3 keeps an unsent upload for 24 hours. Attach the file again.`);
  if (live.length > uploads.length) notes.push(`${live.slice(uploads.length).map((u) => u.name).join(", ")} could not be restored: the composer is at its ${MAX_ATTACHMENTS}-attachment limit.`);
  return { uploads, notes };
}

/** The list after a stash: the server's "stash" event may have brought this entry in first. */
export function withStashed(list: StashEntry[], entry: StashEntry): StashEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, STASH_LIMIT);
}
