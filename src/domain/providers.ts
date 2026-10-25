import type { DashboardProvider, ModelEffort } from "../../shared/api.ts";
import { RUNTIME_MODES } from "../../shared/limits.ts";
import type { RawConfig, RawOptionDescriptor } from "../integrations/t3/schemas.ts";

const EFFORT_OPTION_IDS = new Set(["effort", "reasoningEffort"]);

// Prompt-injected values (such as "ultrathink") are words T3 adds to the prompt, not levels.
function toEffort(descriptors: RawOptionDescriptor[] = []): ModelEffort | null {
  const raw = descriptors.find((descriptor) => descriptor.type === "select" && EFFORT_OPTION_IDS.has(descriptor.id));
  if (!raw) return null;
  const injected = new Set(raw.promptInjectedValues ?? []);
  const levels = (raw.options ?? []).filter((option) => !injected.has(option.id)).map((option) => ({ id: option.id, label: option.label ?? option.id }));
  const fallback = typeof raw.currentValue === "string" ? raw.currentValue : null;
  const defaultLevel = (raw.options ?? []).find((option) => option.isDefault && !injected.has(option.id))?.id ?? fallback;
  return levels.length ? { optionId: raw.id, levels, defaultLevel } : null;
}

export const toProviders = (config: RawConfig): DashboardProvider[] =>
  (config.providers ?? [])
    .filter((provider) => provider.enabled && provider.status === "ready")
    .map((provider) => ({
      instanceId: provider.instanceId,
      displayName: provider.displayName ?? provider.instanceId,
      models: (provider.models ?? []).map((model) => ({ slug: model.slug, name: model.name ?? model.slug, effort: toEffort(model.capabilities?.optionDescriptors) })),
      runtimeModes: provider.supportedRuntimeModes ? RUNTIME_MODES.filter((mode) => provider.supportedRuntimeModes!.includes(mode)) : RUNTIME_MODES,
    }));
