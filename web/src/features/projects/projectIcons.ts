import type { DashboardProject, ProjectIconSpec, UpdateProjectBody } from "../../../../shared/api.ts";
import { monogramText } from "../../lib/monogram.ts";

/** T3's emoji presets. */
export const EMOJI_PRESETS: ReadonlyArray<{ emoji: string; label: string }> = [
  ["💻", "Computer"], ["🛠️", "Tools"], ["🚀", "Rocket"], ["🤖", "Robot"], ["✨", "Sparkles"], ["⚡", "Lightning"],
  ["🌐", "Web"], ["📱", "Mobile"], ["🖥️", "Desktop"], ["⌨️", "Keyboard"], ["⚙️", "Gear"], ["🗄️", "Database"],
  ["☁️", "Cloud"], ["📦", "Package"], ["📚", "Books"], ["🧪", "Test tube"], ["🔒", "Lock"], ["🎮", "Game"],
  ["🎵", "Music"], ["🎬", "Movie"], ["🖼️", "Picture"], ["🛍️", "Shopping"], ["🔥", "Fire"], ["💡", "Idea"],
  ["🧩", "Puzzle"], ["📊", "Chart"], ["🧠", "Brain"], ["🦄", "Unicorn"], ["🐙", "Octopus"], ["🌱", "Seedling"],
].map(([emoji, label]) => ({ emoji: emoji!, label: label! }));

/** At most two letters or digits, uppercased: what T3 accepts as a monogram. */
export function monogramFromInput(text: string): string {
  // Uppercase first: "ß" becomes "SS", and the server counts after uppercasing.
  const chars = Array.from(text.normalize("NFKC").toUpperCase()).filter((c) => /[\p{L}\p{N}]/u.test(c));
  return chars.slice(0, 2).join("");
}

/** The first user-perceived character, so a pasted "🖥️" stays whole. */
export function firstGrapheme(text: string): string {
  const first = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim())[Symbol.iterator]().next();
  return first.done ? "" : first.value.segment;
}

export function iconChanged(before: ProjectIconSpec | null, after: ProjectIconSpec | null): boolean {
  if (!before || !after) return before !== after;
  if (before.kind !== after.kind) return true;
  if (before.kind === "emoji" && after.kind === "emoji") return before.emoji !== after.emoji;
  if (before.kind === "lucide" && after.kind === "lucide") return before.name !== after.name || before.color !== after.color;
  if (before.kind === "monogram" && after.kind === "monogram") return before.text !== after.text || before.color !== after.color;
  return true;
}

export interface EditForm {
  title: string;
  path: string;
  icon: ProjectIconSpec | null;
}

/** Only the changed fields; null when nothing changed. */
export function editBody(project: DashboardProject, form: EditForm): UpdateProjectBody | null {
  const body: UpdateProjectBody = {};
  const title = form.title.trim();
  const path = form.path.trim();
  if (title !== "" && title !== project.title) body.title = title;
  if (path !== "" && path !== project.workspaceRoot) body.path = path;
  if (iconChanged(project.iconSpec ?? null, form.icon)) body.icon = form.icon;
  return Object.keys(body).length > 0 ? body : null;
}

/** What a tab shows when it opens: the last pick of that kind, else T3's default for it. */
export function tabIcon(
  tab: "icons" | "emoji" | "monogram",
  last: { lucide?: string; emoji?: string; text?: string },
  color: string,
  title: string,
): ProjectIconSpec {
  if (tab === "emoji") return { kind: "emoji", emoji: last.emoji ?? "💻" };
  if (tab === "monogram") return { kind: "monogram", text: last.text || monogramFromInput(monogramText(title)) || "P", color };
  return { kind: "lucide", name: last.lucide ?? "folder-code", color };
}
