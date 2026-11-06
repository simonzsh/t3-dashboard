import type { MouseEvent } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { tabSelector } from "../../lib/tabs.ts";
import { fly } from "../../ui/index.ts";

export function flyToSessions(row: Element | null, inSessions: boolean): void {
  if (!inSessions && row) fly(row, document.querySelector(tabSelector("sessions")));
}

/** A click on a row opens its thread; with Shift the agent only joins Sessions and the row flies there. */
export function openRow(e: MouseEvent<HTMLElement>, id: string, inSessions: boolean, onOpen: (id: string, addOnly: boolean) => void): void {
  if (e.shiftKey) flyToSessions(e.currentTarget, inSessions);
  onOpen(id, e.shiftKey);
}

/** The project and the age of a thread. */
export const threadMeta = (t: DashboardThread, project: DashboardProject | undefined, now: Date): string => [project?.title, relativeTime(t.lastActivityAt, now)].filter(Boolean).join(" · ");
