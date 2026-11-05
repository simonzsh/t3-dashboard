import { createElement } from "react";
import type { ProjectIcon as Icon } from "../../../shared/api.ts";
import { monogramColor, monogramText } from "./monogram.ts";

// The server sends Lucide shapes; only plain SVG shapes are drawn.
const SHAPES = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);

function Monogram({ text, color }: { text: string; color: string }) {
  return (
    <svg className="project-icon" viewBox="0 0 16 16" aria-hidden="true" style={{ color }}>
      <rect width="16" height="16" rx="4" fill="currentColor" fillOpacity={0.14} />
      <text x="8" y="10.8" textAnchor="middle" fill="currentColor" fontSize="8.25" fontWeight={700} fontFamily="ui-monospace, monospace" textLength={Array.from(text).length > 1 ? 12 : 6} lengthAdjust="spacingAndGlyphs">
        {text}
      </text>
    </svg>
  );
}

/** The project icon; a project with none gets T3's monogram of its title. */
export function ProjectIcon({ icon, title }: { icon: Icon | null; title: string }) {
  if (!icon) return <Monogram text={monogramText(title)} color={monogramColor(title)} />;
  if (icon.kind === "monogram") return <Monogram text={icon.text} color={icon.color ?? monogramColor(title)} />;
  if (icon.kind === "emoji") {
    return (
      <svg className="project-icon" viewBox="0 0 16 16" aria-hidden="true">
        <text x="8" y="8" textAnchor="middle" dominantBaseline="central" fontSize="12">
          {icon.emoji}
        </text>
      </svg>
    );
  }
  return (
    <svg className="project-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={icon.color ? { color: icon.color } : undefined}>
      {icon.shapes.filter((shape) => SHAPES.has(shape.tag)).map((shape, i) => createElement(shape.tag, { key: i, ...shape.attrs }))}
    </svg>
  );
}
