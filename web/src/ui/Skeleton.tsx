import type { CSSProperties, ReactNode } from "react";

interface Props {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

/** A placeholder shape with the footprint of the content it stands for. */
export function Skeleton({ width, height = 12, radius, className }: Props) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span className={className ? `skeleton ${className}` : "skeleton"} style={style} aria-hidden="true" />;
}

/** Text lines: the last one is shorter, like the end of a paragraph. */
export function SkeletonText({ lines = 2, lineHeight = 12 }: { lines?: number; lineHeight?: number }) {
  return (
    <span className="skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? "60%" : "100%"} />
      ))}
    </span>
  );
}

/** Wraps the placeholders of one area: a screen reader hears one busy region, not the shapes. */
export function SkeletonGroup({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}
