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

interface KeyLike {
  key: string;
  // Alt+digit gives another character on some layouts: digits are also read from the code.
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Cmd+1 to 9 on a Mac, like T3 Code; Alt+1 to 9 elsewhere, because Ctrl+1 to 3 belong to the dashboard. */
export function jumpIndex(e: KeyLike, count: number, mac: boolean): number | null {
  const mod = mac ? e.metaKey && !e.altKey : e.altKey && !e.metaKey;
  if (!mod || e.ctrlKey || e.shiftKey) return null;
  const digit = /^Digit([1-9])$/.exec(e.code ?? "")?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
  const index = digit ? Number(digit) - 1 : -1;
  return index >= 0 && index < count ? index : null;
}

export const jumpLabel = (index: number, mac: boolean): string | null => (index < 9 ? `${mac ? "⌘" : "Alt+"}${index + 1}` : null);

export function currentSpeed(selection: ModelSelection | null, model: DashboardModel): "fast" | "standard" | null {
  const speed = model.speed;
  if (!speed) return null;
  return selection?.options?.find((option) => option.id === speed.optionId)?.value === speed.fast ? "fast" : "standard";
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
