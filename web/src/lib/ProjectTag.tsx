import type { ProjectIcon as ProjectIconData } from "../../../shared/api.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";

/** A project as a small tag: its icon and its name. */
export function ProjectTag({ icon, title }: { icon: ProjectIconData | null; title: string }) {
  return (
    <span className="project-tag">
      <ProjectIcon icon={icon} title={title} />
      <span className="project-tag-text">{title}</span>
    </span>
  );
}
