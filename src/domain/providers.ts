import type { ComposerCommands, DashboardModel, DashboardProvider, ModelDefaults, ModelEffort, ModelSpeed } from "../../shared/api.ts";
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
  return levels.length ? { optionId: raw.id, label: raw.label ?? "Reasoning", levels, defaultLevel } : null;
}

// Like T3 Code: a fastMode toggle, or a serviceTier select with an option labelled Fast.
function toSpeed(descriptors: RawOptionDescriptor[] = []): ModelSpeed | null {
  const toggle = descriptors.find((descriptor) => descriptor.id === "fastMode" && descriptor.type === "boolean");
  if (toggle) return { optionId: "fastMode", fast: true, standard: false, defaultFast: toggle.currentValue === true };
  const tier = descriptors.find((descriptor) => descriptor.id === "serviceTier" && descriptor.type === "select");
  const fast = tier?.options?.find((option) => option.label === "Fast");
  // Standard is never the Fast option, even when Fast is the model's default.
  const others = tier?.options?.filter((option) => option !== fast) ?? [];
  const standard = others.find((option) => option.isDefault) ?? others[0];
  return tier && fast && standard ? { optionId: tier.id, fast: fast.id, standard: standard.id, defaultFast: fast.isDefault === true } : null;
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
          speed: toSpeed(model.capabilities?.optionDescriptors),
          favorite: favorite(provider.instanceId, model.slug),
        })),
        preferencesFor(config.settings?.providerModelPreferences, provider.instanceId),
      ),
      ...(provider.driver && { driver: provider.driver }),
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

/** The commands and skills the provider offers in the thread's folder; its own lists when T3 has no snapshot of that folder. */
export function toComposerCommands(config: RawConfig, instanceId: string, cwd: string | null): ComposerCommands {
  const provider = config.providers?.find((candidate) => candidate.instanceId === instanceId);
  if (!provider) return { commands: [], skills: [] };
  const view = (cwd && provider.workspaceSnapshots?.find((snapshot) => snapshot.cwd === cwd)) || provider;
  return {
    commands: (view.slashCommands ?? []).map((command) => ({ name: command.name, description: command.description ?? null, ...(command.input?.hint && { hint: command.input.hint }) })),
    skills: (view.skills ?? [])
      .filter((skill) => skill.enabled !== false && skill.userInvocable !== false)
      .map((skill) => ({ name: skill.name, displayName: skill.displayName ?? null, description: skill.shortDescription ?? skill.description ?? null })),
  };
}
