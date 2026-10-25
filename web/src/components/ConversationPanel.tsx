import { memo, useEffect, useRef, useState } from "react";
import type { ChatMessage, DashboardEvent, DashboardProvider, DashboardThread, ImageAttachment, ThreadDetail, ThreadSettingsBody } from "../../../shared/api.ts";
import { runActive } from "../agents.ts";
import { api } from "../api.ts";
import { renderMarkdown } from "../markdown.tsx";
import { type PendingMessage, isSettled, pendingLabel } from "../pending.ts";
import { Composer } from "./Composer.tsx";
import { PendingRequestView } from "./PendingRequestView.tsx";
import { RunActivityView } from "./RunActivity.tsx";
import { SubagentStrip } from "./SubagentStrip.tsx";
import { useAction } from "./useAction.ts";

const ROLE_LABELS: Record<string, string> = { user: "You", assistant: "Agent", system: "System" };
// Subagent progress does not always reach the shell stream: poll while one runs.
const SUBAGENT_POLL_MS = 4000;
// Run activity (commands, thinking) has no shell event per step: poll faster while a run is active.
const RUN_POLL_MS = 2500;
// Windows remount when they move between grid, minimized bar and mobile view: keep what they showed.
const detailCache = new Map<string, ThreadDetail>();
const drafts = new Map<string, string>();
const NEAR_BOTTOM_PX = 40;
// After a send the thread may not be marked running yet: poll for a short window anyway.
const SEND_POLL_WINDOW_MS = 15_000;
// The server persists a message a moment after the send: reload a second time.
const SEND_RELOAD_MS = 1500;

// Streaming re-renders the whole list: parse a message again only when its text changes.
const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  return renderMarkdown(text);
});

function Message({ message: m }: { message: ChatMessage }) {
  const time = new Date(m.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className={`msg ${m.role}`}>
      {m.role === "user" ? <div className="bubble">{m.text}</div> : <div className="md">{m.role === "assistant" ? <MarkdownText text={m.text} /> : m.text}</div>}
      <small>
        {ROLE_LABELS[m.role] ?? m.role} · {time}
        {m.streaming && <span className="streaming" role="img" aria-label="Running" />}
      </small>
    </div>
  );
}

function PendingBubble({ message: p }: { message: PendingMessage }) {
  return (
    <div className="msg user pending">
      <div className="bubble">{p.text}</div>
      <small>{pendingLabel(p.images)}</small>
    </div>
  );
}

interface Props {
  threadId: string;
  thread: DashboardThread | null;
  lastEvent: DashboardEvent | null;
  providers: DashboardProvider[];
}

export function ConversationPanel({ threadId, thread, lastEvent, providers }: Props) {
  const [detail, setDetail] = useState<ThreadDetail | null>(() => detailCache.get(threadId) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(() => drafts.get(threadId) ?? "");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sendWindow, setSendWindow] = useState(false);
  const sendWindowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [revealSubagents, setRevealSubagents] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // One action per control, so an error of one does not wipe another.
  const sendAction = useAction();
  const stopAction = useAction();
  const settingsAction = useAction();

  // Bumped on every thread change and cleanup: a late response from an older effect is dropped.
  const epoch = useRef(0);

  async function load() {
    const mine = epoch.current;
    try {
      const next = await api.getThread(threadId);
      if (mine !== epoch.current) return;
      detailCache.set(threadId, next);
      setDetail(next);
      setPending((list) => {
        const now = Date.now();
        const rest = list.filter((p) => !isSettled(p, next.messages, now));
        return rest.length === list.length ? list : rest;
      });
      setLoadError(null);
    } catch (e) {
      if (mine !== epoch.current) return;
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  const reload = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
      clearTimeout(reload.current);
      clearTimeout(sendWindowTimer.current);
      setPending([]);
      setSendWindow(false);
    };
  }, [threadId]);

  // A live update of this thread means new messages: reload, debounced.
  // The timer lives in a ref so that unrelated events do not cancel it.
  useEffect(() => {
    if (lastEvent?.type !== "threads" || !lastEvent.data.upserted.some((t) => t.id === threadId)) return;
    clearTimeout(reload.current);
    reload.current = setTimeout(() => void load(), 500);
  }, [lastEvent]);

  const t = thread ?? detail?.thread ?? null;
  const running = t !== null && runActive(t);

  // Poll only while a run, pending background tasks or a running subagent exist: a bare thread wait has nothing to show.
  const polling = running || sendWindow || Boolean(t?.pendingTasks) || (detail?.subagents.some((s) => s.status === "running") ?? false);
  const pollMs = running || sendWindow ? RUN_POLL_MS : SUBAGENT_POLL_MS;
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    // The next poll starts after the load ends, so slow responses never pile up.
    const tick = async () => {
      await load();
      if (!stopped) timer = setTimeout(() => void tick(), pollMs);
    };
    timer = setTimeout(() => void tick(), pollMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [polling, pollMs, threadId]);

  // Follow new messages unless the user scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [pending.length, detail?.messages.length, detail?.messages.at(-1)?.text, detail?.pendingRequests.length, detail?.activity?.items.length]);

  function setDraft(value: string) {
    setText(value);
    drafts.set(threadId, value);
  }

  // While a run is active the message steers it instead of waiting in the queue.
  async function send(body: string, attachments: ImageAttachment[]): Promise<boolean> {
    const entry: PendingMessage = { id: crypto.randomUUID(), text: body, images: attachments.length, sentAt: Date.now() };
    setPending((list) => [...list, entry]);
    stick.current = true;
    const ok = await sendAction.run(() => api.sendMessage(threadId, { text: body, ...(running && { mode: "steer" as const }), ...(attachments.length && { attachments }) }));
    if (!ok) {
      setPending((list) => list.filter((p) => p.id !== entry.id));
      return false;
    }
    setDraft("");
    setSendWindow(true);
    clearTimeout(sendWindowTimer.current);
    sendWindowTimer.current = setTimeout(() => setSendWindow(false), SEND_POLL_WINDOW_MS);
    void load();
    clearTimeout(reload.current);
    reload.current = setTimeout(() => void load(), SEND_RELOAD_MS);
    return true;
  }

  async function updateSettings(change: ThreadSettingsBody): Promise<boolean> {
    const ok = await settingsAction.run(() => api.updateSettings(threadId, change));
    if (ok) void load();
    return ok;
  }

  return (
    <div className="conversation">
      <div
        className="messages"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        }}
      >
        {loadError && <p className="error">{loadError}</p>}
        {detail && detail.messages.length === 0 && <p className="empty">No messages</p>}
        {!detail && !loadError && <p className="empty">Loading…</p>}
        {detail?.messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {detail && pending.map((p) => <PendingBubble key={p.id} message={p} />)}
        {detail?.activity && <RunActivityView activity={detail.activity} running={running} onShowSubagents={() => setRevealSubagents((n) => n + 1)} />}
        {detail && detail.pendingRequests.length > 0 && (
          <div className="requests">
            {detail.pendingRequests.map((r) => (
              <PendingRequestView key={r.requestId} threadId={threadId} request={r} />
            ))}
          </div>
        )}
      </div>
      {detail && <SubagentStrip key={threadId} subagents={detail.subagents} reveal={revealSubagents} />}
      <Composer
        providers={providers}
        selection={detail?.modelSelection ?? null}
        runtimeMode={detail?.runtimeMode ?? null}
        running={running}
        draft={text}
        onDraft={setDraft}
        onSend={send}
        onStop={() => stopAction.run(() => api.interrupt(threadId))}
        onSettings={updateSettings}
        onReload={() => void load()}
        error={sendAction.error ?? stopAction.error ?? settingsAction.error}
      />
    </div>
  );
}
