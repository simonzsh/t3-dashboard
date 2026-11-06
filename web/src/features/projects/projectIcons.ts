import type { DashboardProject, ProjectIconSpec, UpdateProjectBody } from "../../../../shared/api.ts";

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
  const chars = Array.from(text.normalize("NFKC")).filter((c) => /[\p{L}\p{N}]/u.test(c));
  return chars.slice(0, 2).join("").toUpperCase();
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
