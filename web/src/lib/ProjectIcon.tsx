import { createElement } from "react";
import type { ProjectIcon as Icon } from "../../../shared/api.ts";

// The server sends Lucide shapes; only plain SVG shapes are drawn.
const SHAPES = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);

export function ProjectIcon({ icon }: { icon: Icon | null }) {
  if (!icon) return null;
  return (
    <svg className="project-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={icon.color ? { color: icon.color } : undefined}>
      {icon.shapes.filter((shape) => SHAPES.has(shape.tag)).map((shape, i) => createElement(shape.tag, { key: i, ...shape.attrs }))}
    </svg>
  );
}
