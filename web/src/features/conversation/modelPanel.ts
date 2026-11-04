import type { DashboardModel, DashboardProvider, ModelSelection } from "../../../../shared/api.ts";
import { currentEffort, setOption } from "./composer.ts";

export interface PanelRow {
  provider: DashboardProvider;
  model: DashboardModel;
}

/** The rail entry "favorites", or a provider's instance id. */
export type Rail = string;

const rows = (providers: DashboardProvider[]): PanelRow[] => providers.flatMap((provider) => provider.models.map((model) => ({ provider, model })));

/** A search covers every provider; with no search the rail picks the models. */
export function panelModels(providers: DashboardProvider[], rail: Rail, query: string): PanelRow[] {
  const q = query.trim().toLowerCase();
  if (q !== "") return rows(providers).filter(({ provider, model }) => [model.name, model.slug, provider.displayName].some((text) => text.toLowerCase().includes(q)));
  if (rail === "favorites") return rows(providers).filter((row) => row.model.favorite !== null).sort((a, b) => a.model.favorite! - b.model.favorite!);
  return rows(providers.filter((provider) => provider.instanceId === rail));
}

export function currentSpeed(selection: ModelSelection | null, model: DashboardModel): "fast" | "standard" | null {
  const speed = model.speed;
  if (!speed) return null;
  const value = selection?.options?.find((option) => option.id === speed.optionId)?.value;
  const fast = value === undefined ? speed.defaultFast : value === speed.fast;
  return fast ? "fast" : "standard";
}

export function selectSpeed(selection: ModelSelection, model: DashboardModel, fast: boolean): ModelSelection {
  const speed = model.speed;
  return speed ? setOption(selection, speed.optionId, fast ? speed.fast : speed.standard) : selection;
}

/** What the chip shows: the model, its effort and whether Fast is on. */
export function chipLabel(selection: ModelSelection | null, found: { model: DashboardModel } | null): { name: string; effort: string | null; fast: boolean } {
  if (!found) return { name: selection?.model ?? "Model", effort: null, fast: false };
  const level = currentEffort(selection, found.model);
  return {
    name: found.model.name,
    effort: found.model.effort?.levels.find((l) => l.id === level)?.label ?? null,
    fast: currentSpeed(selection, found.model) === "fast",
  };
}
