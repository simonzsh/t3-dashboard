import type { SharedSessions } from "../../shared/sessions.ts";

/** The shared open sessions, kept in memory and saved through `persist` on each change. */
export class SessionsStore {
  private sessions: SharedSessions | null;
  private readonly persist: (sessions: SharedSessions) => void;

  constructor(sessions: SharedSessions | null, persist: (sessions: SharedSessions) => void) {
    this.sessions = sessions;
    this.persist = persist;
  }

  get(): SharedSessions | null {
    return this.sessions;
  }

  set(sessions: SharedSessions): void {
    this.persist(sessions);
    this.sessions = sessions;
  }
}
