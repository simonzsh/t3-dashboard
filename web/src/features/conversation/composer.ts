import type { ContextUsage, DashboardModel, DashboardProvider, ModelSelection, RuntimeMode, SkillInfo, SlashCommand } from "../../../../shared/api.ts";
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

export function setOption(selection: ModelSelection, id: string, value: unknown): ModelSelection {
  const options = selection.options ?? [];
  const next = options.some((option) => option.id === id) ? options.map((option) => (option.id === id ? { id, value } : option)) : [...options, { id, value }];
  return { ...selection, options: next };
}

export const selectEffort = (selection: ModelSelection, model: DashboardModel, level: string): ModelSelection => setOption(selection, model.effort?.optionId ?? "effort", level);

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

export type TriggerKind = "mention" | "command" | "skill";

export interface Trigger {
  kind: TriggerKind;
  start: number;
  /** What follows the trigger character, up to the caret. */
  query: string;
}

// A price such as $5 is not a skill: a skill name has a letter.
const SKILL_QUERY = /^(?:[\w:-]*[A-Za-z][\w:-]*)?$/;
const COMMAND_QUERY = /^[\w:-]*$/;

/**
 * The word the caret is in, when it opens a menu. It starts the text or follows whitespace, so an email is not one.
 * @ lists files and $ lists skills anywhere; / lists commands only at the start of the message, as in T3 Code.
 */
export function triggerAt(text: string, caret: number): Trigger | null {
  const start = Math.max(text.lastIndexOf(" ", caret - 1), text.lastIndexOf("\n", caret - 1), text.lastIndexOf("\t", caret - 1)) + 1;
  const word = text.slice(start, caret);
  const query = word.slice(1);
  if (word.startsWith("@")) return { kind: "mention", start, query };
  if (word.startsWith("/") && start === 0 && COMMAND_QUERY.test(query)) return { kind: "command", start, query };
  if (word.startsWith("$") && SKILL_QUERY.test(query)) return { kind: "skill", start, query };
  return null;
}

/** Puts the replacement (`@path`, `/command`, `$skill`) in place of the typed word. The caret lands after the space that follows it. */
export function applyTrigger(text: string, trigger: Trigger, replacement: string): { text: string; caret: number } {
  const end = trigger.start + 1 + trigger.query.length;
  const before = `${text.slice(0, trigger.start)}${replacement}`;
  const rest = text.slice(end);
  const spaced = /^\s/.test(rest) ? rest : ` ${rest}`;
  return { text: before + spaced, caret: before.length + 1 };
}

const BOUNDARY = /[:/_-]/;

// Lower is better; null means no match. A name prefix beats a name part, which beats the other fields.
function rank(query: string, name: string, others: Array<string | null | undefined>): number | null {
  const q = query.trim().toLowerCase();
  if (q === "") return 0;
  const n = name.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.split(BOUNDARY).some((part) => part.startsWith(q))) return 1;
  if (n.includes(q)) return 2;
  const at = others.findIndex((field) => field?.toLowerCase().includes(q));
  return at === -1 ? null : 3 + at;
}

function ranked<T>(items: T[], score: (item: T) => number | null): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .filter((entry): entry is { item: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item);
}

/** The commands that match what follows the /. `compact: false` hides /compact, which cannot run during a run. */
export function filterCommands(commands: SlashCommand[], query: string, { compact = true } = {}): SlashCommand[] {
  return ranked(
    commands.filter((command) => compact || command.name !== "compact"),
    (command) => rank(query, command.name, [command.description]),
  );
}

export function filterSkills(skills: SkillInfo[], query: string): SkillInfo[] {
  return ranked(skills, (skill) => rank(query, skill.name, [skill.displayName, skill.description]));
}

const COMPACT_MIN_TOKENS = 200_000;
/** T3 Code's default prompt cache lifetime: 70 minutes. */
const PROMPT_CACHE_TTL_MS = 4_200_000;

/** Like T3 Code: a Claude context of 200k tokens or more whose prompt cache has expired. */
export function suggestsCompact(driver: string | undefined, usage: ContextUsage | null, now: number): boolean {
  if (driver !== "claudeAgent" || !usage || usage.usedTokens < COMPACT_MIN_TOKENS) return false;
  const at = Date.parse(usage.updatedAt ?? "");
  return Number.isFinite(at) && now - at >= (usage.promptCacheTtlMs ?? PROMPT_CACHE_TTL_MS);
}

/** Removes the typed word and the space after it: the command ran instead of going into the text. */
export function dropTrigger(text: string, trigger: Trigger): { text: string; caret: number } {
  const end = trigger.start + 1 + trigger.query.length;
  const rest = text.slice(end).replace(/^ /, "");
  return { text: text.slice(0, trigger.start) + rest, caret: trigger.start };
}

/** `hints` name the menus the composer has, e.g. "@ files". */
export function composerPlaceholder(running: boolean, hints: string[]): string {
  if (hints.length === 0) return running ? "Queue a message for the agent…" : "Send a message to the agent…";
  return `${running ? "Queue a message for the agent" : "Ask anything"}. ${hints.join(", ")}`;
}

// A menu closes on its own Escape; an IME uses Escape to cancel its composition.
export function escapeBlurs(e: { key: string; isComposing: boolean }, menuOpen: boolean): boolean {
  return e.key === "Escape" && !menuOpen && !e.isComposing;
}
