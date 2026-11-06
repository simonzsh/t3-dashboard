import type { DashboardProject } from "../../../shared/api.ts";
import { Dropdown, Icon } from "../ui/index.ts";
import { projectOptions, type DropdownOption } from "./dropdown.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";

/** The id of the last option, which opens the Add project form. */
export const NEW_PROJECT_OPTION = "new-project:";

interface Props {
  label: string;
  projects: DashboardProject[];
  /** The chosen project id; "" when none is. */
  value: string;
  onPick: (projectId: string) => void;
  /** No choice is valid: the placeholder then reads "No project". */
  allowNone?: boolean;
  disabled?: boolean;
  defaultOpen?: boolean;
  /** Called after every pick: the owner moves the focus to its next field. */
  onPicked?: () => void;
  /** Adds a last option "New project…"; it calls this and picks nothing. */
  onNewProject?: () => void;
}

export function pickerOptions(projects: DashboardProject[], withNew: boolean): DropdownOption[] {
  const icons = new Map(projects.map((p) => [p.id, p.icon]));
  const options = projectOptions(projects).map((o) => ({ ...o, icon: <ProjectIcon icon={icons.get(o.id) ?? null} title={o.label} /> }));
  return withNew ? [...options, { id: NEW_PROJECT_OPTION, label: "New project…", icon: <Icon name="folderPlus" /> }] : options;
}

/** The dropdown calls onPick then onPicked: the new-project option skips both, it opens a form instead. */
export function pickerHandlers({ onPick, onPicked, onNewProject }: Pick<Props, "onPick" | "onPicked" | "onNewProject">) {
  let fresh = false;
  return {
    onPick: (id: string) => {
      fresh = id === NEW_PROJECT_OPTION;
      if (fresh) onNewProject?.();
      else onPick(id);
    },
    onPicked: () => {
      if (!fresh) onPicked?.();
      fresh = false;
    },
  };
}

export function ProjectPicker({ label, projects, value, onPick, allowNone = false, disabled = false, defaultOpen, onPicked, onNewProject }: Props) {
  const handlers = pickerHandlers({ onPick, onPicked, onNewProject });
  return (
    <Dropdown
      className="field"
      label={label}
      placeholder={allowNone ? "No project" : projects.length === 0 ? "No T3 project yet" : "Choose a project…"}
      value={value || null}
      options={pickerOptions(projects, onNewProject !== undefined)}
      filterable
      searchPlaceholder="Search projects…"
      disabled={disabled || (!allowNone && projects.length === 0 && !onNewProject)}
      onPick={handlers.onPick}
      onPicked={onPicked && handlers.onPicked}
      defaultOpen={defaultOpen}
    />
  );
}
