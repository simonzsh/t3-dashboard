import type { DashboardProject } from "../../../shared/api.ts";
import { Dropdown } from "../ui/index.ts";
import { projectOptions } from "./dropdown.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";

interface Props {
  label: string;
  projects: DashboardProject[];
  /** The chosen project id; "" when none is. */
  value: string;
  onPick: (projectId: string) => void;
  /** No choice is valid: the placeholder then reads "No project". */
  allowNone?: boolean;
}

export function ProjectPicker({ label, projects, value, onPick, allowNone = false }: Props) {
  const icons = new Map(projects.map((p) => [p.id, p.icon]));
  return (
    <Dropdown
      className="field"
      label={label}
      placeholder={allowNone ? "No project" : projects.length === 0 ? "No T3 project yet" : "Choose a project…"}
      value={value || null}
      options={projectOptions(projects).map((o) => ({ ...o, icon: <ProjectIcon icon={icons.get(o.id) ?? null} /> }))}
      filterable
      disabled={!allowNone && projects.length === 0}
      onPick={onPick}
    />
  );
}
