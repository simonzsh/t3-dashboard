import { useEffect, useReducer, type Dispatch } from "react";
import { sessionsReducer, loadSessions, saveSessions, type SessionsAction, type SessionsState } from "./sessions.ts";
import { browserStorage } from "../../lib/storage.ts";

// localStorage starts the sessions at once and keeps focus and maximize; the ids come from the server (useSessionsSync).
export function useSessions(): [SessionsState, Dispatch<SessionsAction>] {
  const [sessions, dispatch] = useReducer(sessionsReducer, undefined, () => loadSessions(browserStorage()));
  useEffect(() => saveSessions(browserStorage(), sessions), [sessions]);
  return [sessions, dispatch];
}
