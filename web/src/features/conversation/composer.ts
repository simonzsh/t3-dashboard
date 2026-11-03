import type { DashboardModel, DashboardProvider, ModelSelection, RuntimeMode } from "../../../../shared/api.ts";
import { IMAGE_TYPES, MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_IMAGES_TOTAL_BYTES } from "../../../../shared/limits.ts";

export const RUNTIME_MODE_LABELS: Record<RuntimeMode, { label: string; description: string }> = {
  "approval-required": { label: "Supervised", description: "Ask before commands and file changes." },
  "auto-accept-edits": { label: "Auto-accept edits", description: "Auto-approve edits, ask before other actions." },
  auto: { label: "Auto", description: "Supported providers approve routine actions; others still ask." },
  "full-access": { label: "Full access", description: "Allow commands and edits without prompts." },
};

// Touch keyboards have no Shift+Enter: there Enter adds a line and the button sends.
export function isSendKey(e: { key: string; shiftKey: boolean; isComposing: boolean }, touch: boolean): boolean {
  return e.key === "Enter" && !e.shiftKey && !touch && !e.isComposing;
}

export function findModel(providers: DashboardProvider[], selection: ModelSelection | null): { provider: DashboardProvider; model: DashboardModel } | null {
  const provider = selection ? providers.find((p) => p.instanceId === selection.instanceId) : undefined;
  const model = provider?.models.find((m) => m.slug === selection?.model);
  return provider && model ? { provider, model } : null;
}

export function currentEffort(selection: ModelSelection | null, model: DashboardModel): string | null {
  const effort = model.effort;
  if (!effort) return null;
  const value = selection?.options?.find((option) => option.id === effort.optionId)?.value;
  return effort.levels.some((level) => level.id === value) ? (value as string) : effort.defaultLevel;
}

export function selectEffort(selection: ModelSelection, model: DashboardModel, level: string): ModelSelection {
  const optionId = model.effort?.optionId ?? "effort";
  const options = selection.options ?? [];
  const next = options.some((option) => option.id === optionId)
    ? options.map((option) => (option.id === optionId ? { id: optionId, value: level } : option))
    : [...options, { id: optionId, value: level }];
  return { ...selection, options: next };
}

// Other options (fast mode, context window) belong to the old model: only a supported effort carries over.
export function selectModel(from: ModelSelection | null, provider: DashboardProvider, model: DashboardModel): ModelSelection {
  const level = from?.options?.find((option) => option.id === "effort" || option.id === "reasoningEffort")?.value;
  const effort = model.effort;
  const keep = effort && effort.levels.some((l) => l.id === level);
  return { instanceId: provider.instanceId, model: model.slug, ...(keep && { options: [{ id: effort.optionId, value: level }] }) };
}

interface FileLike {
  name: string;
  type: string;
  size: number;
}

export const attachmentType = (file: { type: string }): "image" | "file" => (IMAGE_TYPES.includes(file.type) ? "image" : "file");

const mb = (bytes: number) => `${bytes / 1024 / 1024} MB`;

/** T3's limits: 100 files per message, 10 MB per image, 50 MB per file, 80 MB of images in all. */
export function acceptFiles<F extends FileLike>(existing: FileLike[], files: F[]): { accepted: F[]; error: string | null } {
  const accepted: F[] = [];
  let error: string | null = null;
  let count = existing.length;
  let images = existing.filter((f) => attachmentType(f) === "image").reduce((sum, f) => sum + f.size, 0);
  for (const file of files) {
    const image = attachmentType(file) === "image";
    if (file.size === 0) error = `${file.name}: the file is empty.`;
    else if (image && file.size > MAX_IMAGE_BYTES) error = `${file.name}: images must be ${mb(MAX_IMAGE_BYTES)} or less.`;
    else if (!image && file.size > MAX_FILE_BYTES) error = `${file.name}: files must be ${mb(MAX_FILE_BYTES)} or less.`;
    else if (count >= MAX_ATTACHMENTS) error = `Up to ${MAX_ATTACHMENTS} files per message.`;
    else if (image && images + file.size > MAX_IMAGES_TOTAL_BYTES) error = `Images can total up to ${mb(MAX_IMAGES_TOTAL_BYTES)} per message.`;
    else {
      accepted.push(file);
      count++;
      if (image) images += file.size;
    }
  }
  return { accepted, error };
}

export interface Mention {
  start: number;
  /** What follows the @, up to the caret. */
  query: string;
}

/** The @ word the caret is in: it starts the text or follows whitespace, so an email is not one. */
export function mentionAt(text: string, caret: number): Mention | null {
  const start = Math.max(text.lastIndexOf(" ", caret - 1), text.lastIndexOf("\n", caret - 1), text.lastIndexOf("\t", caret - 1)) + 1;
  const word = text.slice(start, caret);
  return word.startsWith("@") ? { start, query: word.slice(1) } : null;
}

/** Puts `@path` in place of the typed word. The caret lands after the space that follows it. */
export function applyMention(text: string, mention: Mention, path: string): { text: string; caret: number } {
  const end = mention.start + 1 + mention.query.length;
  const before = `${text.slice(0, mention.start)}@${path}`;
  const rest = text.slice(end);
  const spaced = /^\s/.test(rest) ? rest : ` ${rest}`;
  return { text: before + spaced, caret: before.length + 1 };
}
