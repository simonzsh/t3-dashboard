import { NTFY_DEFAULT_SERVER, ALERTS_ARMED_MAX, alertServer, isAlertClick, isAlertTopic, type AlertTestResult, type AlertsSettings, type AlertsState } from "../../shared/alerts.ts";
import { statusMap, transitions, type NotifyEntry } from "../../shared/notify.ts";
import type { AgentStatus } from "../../shared/status.ts";
import type { DashboardThread } from "../../shared/threads.ts";
import type { StoredAlerts } from "../config/alertsFile.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { NtfyMessage, NtfyTarget, TopicCheck } from "../integrations/ntfy/client.ts";
import { DomainError } from "./errors.ts";

export interface AlertsOptions {
  initial: StoredAlerts;
  persist(file: StoredAlerts): void;
  send(target: NtfyTarget, message: NtfyMessage): Promise<void>;
  check(target: NtfyTarget): Promise<TopicCheck>;
  newTopic(): string;
  threads(): DashboardThread[];
  projectTitle(projectId: string): string | undefined;
  now(): Date;
  onChange(state: AlertsState): void;
  warn(message: string): void;
}

export interface Alerts {
  settings(): AlertsSettings;
  setup(server?: string): AlertsSettings;
  useTopic(topic: string, server?: string): AlertsSettings;
  test(): Promise<AlertTestResult>;
  disconnect(): AlertsSettings;
  state(): AlertsState;
  arm(threadId: string, clickUrl: string): AlertsState;
  disarm(threadId: string): AlertsState;
  /** Feed the full thread list after each change. The first call only takes a baseline. */
  observe(threads: DashboardThread[]): void;
}

export function createAlerts(options: AlertsOptions): Alerts {
  const { persist, send, check, threads, projectTitle, now, onChange, warn } = options;
  let file: StoredAlerts = structuredClone(options.initial);
  let previous: Map<string, AgentStatus> | null = null;

  const state = (): AlertsState => ({ configured: file.topic !== null, armed: file.armed.map((entry) => entry.threadId) });
  const settings = (): AlertsSettings =>
    file.topic === null ? { connected: false, server: null, topic: null, subscribeUrl: null } : { connected: true, server: file.server, topic: file.topic, subscribeUrl: `${file.server}/${file.topic}` };
  const save = (next: StoredAlerts) => {
    file = next;
    persist(structuredClone(file));
    onChange(state());
  };
  const target = (): NtfyTarget | null => (file.topic === null ? null : { server: file.server, topic: file.topic });
  const serverOf = (server: string | undefined): string => {
    if (server === undefined || server.trim() === "") return NTFY_DEFAULT_SERVER;
    const clean = alertServer(server.trim());
    if (clean === null) throw new DomainError("invalid", "Enter a server URL that starts with http:// or https://.");
    return clean;
  };
  const configure = (topic: string, server: string | undefined): AlertsSettings => {
    save({ ...file, server: serverOf(server), topic });
    return settings();
  };
  const mustBeSetUp = (): NtfyTarget => {
    const found = target();
    if (!found) throw new DomainError("conflict", "Alerts are not set up.");
    return found;
  };

  function alertFor(entry: NotifyEntry, clickUrl: string): NtfyMessage {
    const project = projectTitle(entry.thread.projectId);
    return {
      title: entry.thread.title || "Session",
      message: project ? `${entry.label} · ${project}` : entry.label,
      priority: entry.kind === "waiting" || entry.tone === "error" ? 4 : 3,
      click: clickUrl,
    };
  }

  return {
    settings,
    setup: (server) => configure(options.newTopic(), server),
    useTopic(topic, server) {
      const clean = topic.trim();
      if (!isAlertTopic(clean)) throw new DomainError("invalid", "A topic has 1 to 64 letters, digits, dashes or underscores.");
      return configure(clean, server);
    },
    async test() {
      return { result: await check(mustBeSetUp()) };
    },
    disconnect() {
      save({ server: NTFY_DEFAULT_SERVER, topic: null, armed: [] });
      return settings();
    },
    state,
    arm(threadId, clickUrl) {
      mustBeSetUp();
      if (!isAlertClick(clickUrl)) throw new DomainError("invalid", "The link is not a valid http(s) URL.");
      if (!threads().some((t) => t.id === threadId)) throw new DomainError("not-found", "This session no longer exists.");
      const others = file.armed.filter((entry) => entry.threadId !== threadId);
      if (others.length >= ALERTS_ARMED_MAX) throw new DomainError("conflict", `At most ${ALERTS_ARMED_MAX} sessions can be armed.`);
      save({ ...file, armed: [...others, { threadId, clickUrl, armedAt: now().toISOString() }] });
      return state();
    },
    disarm(threadId) {
      if (file.armed.some((entry) => entry.threadId === threadId)) save({ ...file, armed: file.armed.filter((entry) => entry.threadId !== threadId) });
      return state();
    },
    observe(list) {
      const fired = transitions(previous, list);
      previous = statusMap(list);
      const alive = new Set(list.map((t) => t.id));
      const due = fired.flatMap((entry) => {
        const armed = file.armed.find((a) => a.threadId === entry.thread.id);
        return armed ? [{ entry, clickUrl: armed.clickUrl }] : [];
      });
      const spent = new Set(due.map(({ entry }) => entry.thread.id));
      const kept = file.armed.filter((a) => alive.has(a.threadId) && !spent.has(a.threadId));
      if (kept.length === file.armed.length) return;
      // Disarm before sending: a failed send must not repeat the alert on the next change.
      save({ ...file, armed: kept });
      const found = target();
      if (!found) return;
      for (const { entry, clickUrl } of due) {
        send(found, alertFor(entry, clickUrl)).catch((error: unknown) => warn(`Phone alert not sent: ${error instanceof IntegrationError ? error.message : "unexpected error"}`));
      }
    },
  };
}
