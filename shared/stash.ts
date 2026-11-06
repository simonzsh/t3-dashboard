import { isObject } from "./guards.ts";
import { MAX_ATTACHMENTS } from "./limits.ts";
import type { UploadedAttachment } from "./requests.ts";

// T3 Code keeps its stash in the browser only: this one is the dashboard's own, shared by its devices.
export const STASH_LIMIT = 20;
/** T3 drops an upload nobody sent after a day; a stash entry says so past this age. */
export const STASH_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const STASH_TEXT_MAX = 100_000;

export interface StashEntry {
  id: string;
  text: string;
  /** Files already in T3, so an entry carries no bytes. */
  uploads: UploadedAttachment[];
  createdAt: string;
  /** The conversation the draft came from, for display only. */
  threadId: string;
  threadTitle: string;
}

export interface StashBody {
  text: string;
  uploads: UploadedAttachment[];
  threadId: string;
  threadTitle: string;
}

export interface StashList {
  /** Newest first. */
  entries: StashEntry[];
}

export interface StashCreated {
  ok: true;
  entry: StashEntry;
  /** Entries the limit pushed out: the caller frees their uploads. */
  evicted: StashEntry[];
}

function toUpload(value: unknown): UploadedAttachment | null {
  if (!isObject(value) || (value.type !== "image" && value.type !== "file")) return null;
  const { id, name, mimeType, sizeBytes } = value;
  if (typeof id !== "string" || typeof name !== "string" || typeof mimeType !== "string" || typeof sizeBytes !== "number") return null;
  return { type: value.type, id, name, mimeType, sizeBytes };
}

function toEntry(value: unknown): StashEntry | null {
  if (!isObject(value)) return null;
  const { id, text, uploads, createdAt, threadId, threadTitle } = value;
  if (typeof id !== "string" || id === "" || typeof text !== "string" || typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) return null;
  if (typeof threadId !== "string" || typeof threadTitle !== "string" || !Array.isArray(uploads)) return null;
  return { id, text, uploads: uploads.flatMap((u) => toUpload(u) ?? []).slice(0, MAX_ATTACHMENTS), createdAt, threadId, threadTitle };
}

/** Newest first, valid entries only, unique ids, capped. Null when the value is not a stash. */
export function normalizeStash(value: unknown): StashEntry[] | null {
  if (!isObject(value) || !Array.isArray(value.entries)) return null;
  const seen = new Set<string>();
  const entries: StashEntry[] = [];
  for (const raw of value.entries) {
    const entry = toEntry(raw);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  return entries.slice(0, STASH_LIMIT);
}

/** Uploads T3 may still hold, and the names of those it dropped. */
export function liveUploads(entry: StashEntry, now: Date): { uploads: UploadedAttachment[]; expired: string[] } {
  const expired = now.getTime() - Date.parse(entry.createdAt) > STASH_UPLOAD_TTL_MS;
  return expired ? { uploads: [], expired: entry.uploads.map((u) => u.name) } : { uploads: entry.uploads, expired: [] };
}

/** One line for a row: the first non-empty line of the text, or the attachment count. */
export function stashPreview(entry: StashEntry): string {
  const line = entry.text.split("\n").find((l) => l.trim() !== "")?.trim();
  if (line) return line;
  const n = entry.uploads.length;
  return `${n} attachment${n === 1 ? "" : "s"}`;
}
