import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Icon, IconButton } from "../ui/index.ts";

interface Notice {
  id: number;
  message: string;
}

const MAX_NOTICES = 4;
/** A conversation line goes by itself after this: it must not sit over the messages. */
export const LOCAL_NOTICE_MS = 8000;

const NoticeContext = createContext<(message: string) => void>(() => {});

/** Shows an error in the red banner at the top of the dashboard. */
export const useNotify = (): ((message: string) => void) => useContext(NoticeContext);

/** `local`: the banner sits at the top of this subtree (a conversation), not of the page. */
export function NoticeProvider({ children, local = false }: { children: ReactNode; local?: boolean }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(0);
  // The same message twice is one line: a poll that keeps failing must not stack banners.
  const dismiss = useCallback((id: number) => setNotices((current) => current.filter((n) => n.id !== id)), []);
  const notify = useCallback(
    (message: string) => {
      const id = ++nextId.current;
      setNotices((current) => (current.some((n) => n.message === message) ? current : [...current.slice(1 - MAX_NOTICES), { id, message }]));
      // A duplicate never gets this id, so its timer removes nothing.
      if (local) setTimeout(() => dismiss(id), LOCAL_NOTICE_MS);
    },
    [local, dismiss],
  );
  return (
    <NoticeContext.Provider value={notify}>
      {local ? (
        <div className="notice-scope">
          {children}
          <ErrorBanner notices={notices} onDismiss={dismiss} local />
        </div>
      ) : (
        <>
          {children}
          <ErrorBanner notices={notices} onDismiss={dismiss} />
        </>
      )}
    </NoticeContext.Provider>
  );
}

export function ErrorBanner({ notices, onDismiss, local = false }: { notices: Notice[]; onDismiss: (id: number) => void; local?: boolean }) {
  if (notices.length === 0) return null;
  return (
    <div className={`error-banner${local ? " local" : ""}`} role="alert">
      {notices.map((n) => (
        <div key={n.id} className="error-banner-line">
          <Icon name="alert" />
          <span className="error-banner-text">{n.message}</span>
          <IconButton label="Dismiss" variant="ghost" size="sm" onClick={() => onDismiss(n.id)}>
            <Icon name="x" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
