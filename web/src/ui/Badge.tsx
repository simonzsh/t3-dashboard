import type { ReactNode } from "react";

export type BadgeVariant = "waiting" | "running" | "done" | "error" | "neutral";

export function Badge({ variant = "neutral", className, children }: { variant?: BadgeVariant; className?: string; children: ReactNode }) {
  return <span className={["badge", variant, className].filter(Boolean).join(" ")}>{children}</span>;
}
