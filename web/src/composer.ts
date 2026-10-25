import type { DashboardModel, DashboardProvider, ModelSelection, RuntimeMode } from "../../shared/api.ts";

// Same limits as the server: T3 takes images of up to 10 MB, and the request body stays under 25 MB.
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Base64 grows data by a third: 18 MB of images stays under the 25 MB body limit.
export const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export const RUNTIME_MODE_LABELS: Record<RuntimeMode, { label: string; description: string }> = {
  "approval-required": { label: "Supervised", description: "Ask before commands and file changes." },
  "auto-accept-edits": { label: "Auto-accept edits", description: "Auto-approve edits, ask before other actions." },
  auto: { label: "Auto", description: "Supported providers approve routine actions; others still ask." },
  "full-access": { label: "Full access", description: "Allow commands and edits without prompts." },
};

export function findModel(providers: DashboardProvider[], selection: ModelSelection | null): { provider: DashboardProvider; model: DashboardModel } | null {
  const provider = selection ? providers.find((p) => p.instanceId === selection.instanceId) : undefined;
  const model = provider?.models.find((m) => m.slug === selection?.model);
  return provider && model ? { provider, model } : null;
}

export function modelLabel(providers: DashboardProvider[], selection: ModelSelection | null): string {
  if (!selection) return "Model";
  return findModel(providers, selection)?.model.name ?? selection.model;
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

export function acceptImages<F extends FileLike>(existing: Array<{ size: number }>, files: F[]): { accepted: F[]; error: string | null } {
  const accepted: F[] = [];
  let error: string | null = null;
  let total = existing.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) error = `${file.name}: only PNG, JPEG, GIF and WebP images can be attached.`;
    else if (file.size > MAX_IMAGE_BYTES) error = `${file.name}: images must be 10 MB or less.`;
    else if (existing.length + accepted.length >= MAX_IMAGES) error = `Up to ${MAX_IMAGES} images per message.`;
    else if (total + file.size > MAX_TOTAL_BYTES) error = "Images can total up to 18 MB per message.";
    else {
      accepted.push(file);
      total += file.size;
    }
  }
  return { accepted, error };
}
