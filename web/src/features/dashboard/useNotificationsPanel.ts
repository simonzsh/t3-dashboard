import { readKey, usePersisted, writeKey, type Store } from "../../lib/storage.ts";

export const NOTIFICATIONS_PANEL_KEY = "t3-dashboard-notifications";

export const loadPanelOpen = (storage: Store | null): boolean => readKey(storage, NOTIFICATIONS_PANEL_KEY) !== "closed";

export const savePanelOpen = (storage: Store | null, open: boolean): void => writeKey(storage, NOTIFICATIONS_PANEL_KEY, open ? "open" : "closed");

/** Open state of the Notifications panel: open by default, saved per browser, the same at every width. */
export function useNotificationsPanel() {
  const [open, setOpen] = usePersisted(loadPanelOpen, savePanelOpen);
  return { open, toggle: () => setOpen((was) => !was) };
}
