import { createContext, useContext } from "react";
import { Icon } from "../ui/index.ts";

const NONE: ReadonlySet<string> = new Set();

/** The ids of the threads tied to an automation, from `/api/automations`. */
export const AutomationThreadsContext = createContext<ReadonlySet<string>>(NONE);

export const useIsAutomationThread = (id: string): boolean => useContext(AutomationThreadsContext).has(id);

/** A small icon after a title: the session belongs to an automation. */
export function AutomationMark({ id }: { id: string }) {
  if (!useIsAutomationThread(id)) return null;
  return (
    <span className="auto-mark" data-tooltip="Automation">
      <Icon name="calendarClock" label="Automation" />
    </span>
  );
}
