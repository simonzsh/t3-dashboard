import type { ProjectIcon as ProjectIconData } from "../../../shared/api.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";

/** A project as a small tag: its icon and its name. `noIcon` leaves the mark out (the row already shows it). */
export function ProjectTag({ icon, title, noIcon = false }: { icon: ProjectIconData | null; title: string; noIcon?: boolean }) {
  return (
    <span className="project-tag">
      {!noIcon && <ProjectIcon icon={icon} title={title} />}
      <span className="project-tag-text">{title}</span>
    </span>
  );
}
