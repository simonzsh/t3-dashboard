import type { DashboardProvider } from "../../../shared/api.ts";

/** Model slug -> display name, over every provider. */
export const modelNameMap = (providers: readonly DashboardProvider[]): Map<string, string> => new Map(providers.flatMap((p) => p.models).map((m) => [m.slug, m.name]));

/** The display name of a thread's model, its slug when unknown, null without a model. */
export const modelLabel = (model: string | null, names: ReadonlyMap<string, string>): string | null => (model ? (names.get(model) ?? model) : null);
