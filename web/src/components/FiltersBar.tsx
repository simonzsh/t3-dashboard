import type { DashboardProject, DashboardThread } from "../../../shared/api.ts";
import type { Filters } from "../filters.ts";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  projects: DashboardProject[];
  threads: DashboardThread[];
  onNewThread: () => void;
}

export function FiltersBar({ filters, onChange, projects, threads, onNewThread }: Props) {
  const providers = [...new Set(threads.map((t) => t.provider).filter(Boolean))].sort();
  const sorted = [...projects].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="filters">
      <select aria-label="Projet" value={filters.projectId ?? ""} onChange={(e) => onChange({ ...filters, projectId: e.target.value || null })}>
        <option value="">Tous les projets</option>
        {sorted.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <select aria-label="Provider" value={filters.provider ?? ""} onChange={(e) => onChange({ ...filters, provider: e.target.value || null })}>
        <option value="">Tous les providers</option>
        {providers.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input type="search" placeholder="Rechercher…" aria-label="Recherche" value={filters.search} onChange={(e) => onChange({ ...filters, search: e.target.value })} />
      <button className="primary" onClick={onNewThread}>
        Nouveau thread
      </button>
    </div>
  );
}
