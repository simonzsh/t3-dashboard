import { useEffect, useState } from "react";
import { readKey, usePersisted, writeKey, type Store } from "../../lib/storage.ts";

export const NOTIFICATIONS_PANEL_KEY = "t3-dashboard-notifications";

export const loadPanelOpen = (storage: Store | null): boolean => readKey(storage, NOTIFICATIONS_PANEL_KEY) !== "closed";

export const savePanelOpen = (storage: Store | null, open: boolean): void => writeKey(storage, NOTIFICATIONS_PANEL_KEY, open ? "open" : "closed");

/**
 * Open state of the Notifications panel. Wide screens: open by default, saved per browser.
 * Sheet mode (no room for the right column): the side sheet is closed by default, kept in memory, and closes when Home tab is left.
 */
export function useNotificationsPanel(sheetMode: boolean, active: boolean) {
  const [saved, setSaved] = usePersisted(loadPanelOpen, savePanelOpen);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!active) setSheet(false);
  }, [active]);
  const set = sheetMode ? setSheet : setSaved;
  return { open: sheetMode ? sheet : saved, toggle: () => set((was) => !was), close: () => setSheet(false) };
}
