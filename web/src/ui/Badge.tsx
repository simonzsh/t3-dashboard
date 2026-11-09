import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import { STATUS_ICONS } from "./statusIcons.ts";

export type BadgeVariant = "waiting" | "running" | "done" | "error" | "neutral";

export function Badge({ variant = "neutral", className, children }: { variant?: BadgeVariant; className?: string; children: ReactNode }) {
  const icon = variant === "waiting" || variant === "error" ? STATUS_ICONS[variant] : null;
  return (
    <span className={["badge", variant, className].filter(Boolean).join(" ")}>
      {icon && <Icon name={icon} className="icon badge-icon" />}
      {children}
    </span>
  );
}
