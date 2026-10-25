import type { DashboardModel, DashboardProvider, ModelDefaults, ModelEffort } from "../../shared/api.ts";
import { RUNTIME_MODES, isRuntimeMode } from "../../shared/limits.ts";
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

interface Preferences {
  hidden: Set<string>;
  order: string[];
}

// T3 stores { [instanceId]: { hiddenModels, modelOrder } }; anything else is ignored.
function preferencesFor(raw: unknown, instanceId: string): Preferences {
  const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[instanceId] : undefined;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
  return { hidden: new Set(list(record.hiddenModels)), order: list(record.modelOrder) };
}

// Models named in modelOrder come first, in that order; the others keep T3's order.
function arrange(models: DashboardModel[], { hidden, order }: Preferences): DashboardModel[] {
  const rank = (slug: string) => (order.includes(slug) ? order.indexOf(slug) : order.length);
  return models.filter((model) => !hidden.has(model.slug)).map((model, index) => ({ model, index })).sort((a, b) => rank(a.model.slug) - rank(b.model.slug) || a.index - b.index).map(({ model }) => model);
}

export function toProviders(config: RawConfig): DashboardProvider[] {
  const favorites = config.settings?.favorites ?? [];
  const favorite = (instanceId: string, slug: string) => {
    const rank = favorites.findIndex((entry) => entry.provider === instanceId && entry.model === slug);
    return rank === -1 ? null : rank;
  };
  return (config.providers ?? [])
    .filter((provider) => provider.enabled && provider.status === "ready")
    .map((provider) => ({
      instanceId: provider.instanceId,
      displayName: provider.displayName ?? provider.instanceId,
      models: arrange(
        (provider.models ?? []).map((model) => ({
          slug: model.slug,
          name: model.name ?? model.slug,
          effort: toEffort(model.capabilities?.optionDescriptors),
          favorite: favorite(provider.instanceId, model.slug),
        })),
        preferencesFor(config.settings?.providerModelPreferences, provider.instanceId),
      ),
      runtimeModes: provider.supportedRuntimeModes ? RUNTIME_MODES.filter((mode) => provider.supportedRuntimeModes!.includes(mode)) : RUNTIME_MODES,
    }));
}

export const NO_MODEL_DEFAULTS: ModelDefaults = { selection: null, runtimeMode: null };

export function toModelDefaults(config: RawConfig): ModelDefaults {
  const settings = config.settings;
  if (!settings) return NO_MODEL_DEFAULTS;
  const mode = settings.defaultRuntimeMode;
  return {
    selection: settings.defaultModelSelection ?? null,
    runtimeMode: isRuntimeMode(mode) ? mode : null,
  };
}
