import { useCallback, useState } from "react";
import { readKey, usePersisted, writeKey, type Store } from "../../lib/storage.ts";

export const NOTIFICATIONS_PANEL_KEY = "t3-dashboard-notifications";

export const loadPanelOpen = (storage: Store | null): boolean => readKey(storage, NOTIFICATIONS_PANEL_KEY) !== "closed";

export const savePanelOpen = (storage: Store | null, open: boolean): void => writeKey(storage, NOTIFICATIONS_PANEL_KEY, open ? "open" : "closed");

/** Open state of the Notifications panel: saved on a wide screen, closed by default and kept in memory on a phone; a phone panel closes when Dashboard is left. */
export function useNotificationsPanel(compact: boolean, active: boolean) {
  const [wideOpen, setWideOpen] = usePersisted(loadPanelOpen, savePanelOpen);
  const [phoneOpen, setPhoneOpen] = useState(false);
  if (!active && phoneOpen) setPhoneOpen(false);
  const toggle = useCallback(() => (compact ? setPhoneOpen((was) => !was) : setWideOpen((was) => !was)), [compact, setWideOpen]);
  const close = useCallback(() => setPhoneOpen(false), []);
  return { open: compact ? phoneOpen : wideOpen, toggle, close };
}
