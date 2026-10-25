import type { DashboardProject } from "../../../shared/api.ts";
import { Dropdown } from "../ui/index.ts";
import { projectOptions } from "./dropdown.ts";

interface Props {
  label: string;
  projects: DashboardProject[];
  /** The chosen project id; "" when none is. */
  value: string;
  onPick: (projectId: string) => void;
}

export function ProjectPicker({ label, projects, value, onPick }: Props) {
  return (
    <Dropdown
      className="field"
      label={label}
      placeholder={projects.length === 0 ? "No T3 project yet" : "Choose a project…"}
      value={value || null}
      options={projectOptions(projects)}
      filterable
      disabled={projects.length === 0}
      onPick={onPick}
    />
  );
}
