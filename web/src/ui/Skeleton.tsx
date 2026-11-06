import type { CSSProperties, ReactNode } from "react";

interface Props {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}

/** A placeholder shape with the footprint of the content it stands for. */
export function Skeleton({ width, height = 12, radius }: Props) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span className="skeleton" style={style} aria-hidden="true" />;
}

/** Wraps the placeholders of one area: a screen reader hears one busy region, not the shapes. */
export function SkeletonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}
