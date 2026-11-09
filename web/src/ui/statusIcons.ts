import type { IconName } from "./Icon.tsx";

export const STATUS_ICONS = {
  waiting: "diamond",
  error: "alert",
  done: "circleCheck",
  idle: "info",
} as const satisfies Record<string, IconName>;
