import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

export type BadgeVariant = "waiting" | "running" | "done" | "error" | "neutral";

// The same symbol as the status marks of the lists: a person for "waits for you", an alert circle for a failure.
const STATUS_ICONS = { waiting: "user", error: "alert" } as const;

export function Badge({ variant = "neutral", className, children }: { variant?: BadgeVariant; className?: string; children: ReactNode }) {
  const icon = variant === "waiting" || variant === "error" ? STATUS_ICONS[variant] : null;
  return (
    <span className={["badge", variant, className].filter(Boolean).join(" ")}>
      {icon && <Icon name={icon} className="icon badge-icon" />}
      {children}
    </span>
  );
}
