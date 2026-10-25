import { useEffect, useRef, useState } from "react";
import type { DashboardEvent, DashboardThread, ThreadDetail } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { PendingRequestView } from "./PendingRequestView.tsx";
import { useAction } from "./useAction.ts";

const ROLE_LABELS: Record<string, string> = { user: "You", assistant: "Agent", system: "System" };
// Windows remount when they move between grid, minimized bar and mobile view: keep what they showed.
const detailCache = new Map<string, ThreadDetail>();
const drafts = new Map<string, string>();
const NEAR_BOTTOM_PX = 40;

interface Props {
  threadId: string;
  thread: DashboardThread | null;
  lastEvent: DashboardEvent | null;
  onClose: () => void;
}

export function ConversationPanel({ threadId, thread, lastEvent, onClose }: Props) {
  const [detail, setDetail] = useState<ThreadDetail | null>(() => detailCache.get(threadId) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(() => drafts.get(threadId) ?? "");
  const [mode, setMode] = useState<"queue" | "steer">("queue");
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const send = useAction();
  const control = useAction();

  async function load() {
    try {
      const next = await api.getThread(threadId);
      detailCache.set(threadId, next);
      setDetail(next);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  const reload = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void load();
    return () => clearTimeout(reload.current);
  }, [threadId]);

  // A live update of this thread means new messages: reload, debounced.
  // The timer lives in a ref so that unrelated events do not cancel it.
  useEffect(() => {
    if (lastEvent?.type !== "threads" || !lastEvent.data.upserted.some((t) => t.id === threadId)) return;
    clearTimeout(reload.current);
    reload.current = setTimeout(() => void load(), 500);
  }, [lastEvent]);

  // Follow new messages unless the user scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [detail?.messages.length, detail?.messages.at(-1)?.text, detail?.pendingRequests.length]);

  const t = thread ?? detail?.thread ?? null;
  const running = t?.bucket === "running" || Boolean(t?.activeRunId);

  function setDraft(value: string) {
    setText(value);
    drafts.set(threadId, value);
  }

  async function submit() {
    const body = text.trim();
    if (!body) return;
    const ok = await send.run(() => api.sendMessage(threadId, running ? { text: body, mode } : { text: body }));
    if (ok) {
      stick.current = true;
      setDraft("");
    }
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
          <div key={m.id} className={`msg ${m.role}`}>
            <small>
              {ROLE_LABELS[m.role] ?? m.role} · {new Date(m.createdAt).toLocaleString("en-US")}
              {m.streaming ? " · running…" : ""}
            </small>
            {m.text}
          </div>
        ))}
        {detail && detail.pendingRequests.length > 0 && (
          <div className="requests">
            {detail.pendingRequests.map((r) => (
              <PendingRequestView key={r.requestId} threadId={threadId} request={r} />
            ))}
          </div>
        )}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a message to the agent…"
          aria-label="Message"
        />
        <div className="row">
          {running && (
            <select aria-label="Send mode" value={mode} onChange={(e) => setMode(e.target.value as "queue" | "steer")}>
              <option value="queue">Queue</option>
              <option value="steer">Steer the run</option>
            </select>
          )}
          <button className="primary" type="submit" disabled={send.busy || !text.trim()}>
            Send
          </button>
          {send.error && <span className="error">{send.error}</span>}
          <span className="composer-actions">
            {running && (
              <button type="button" className="danger" disabled={control.busy} onClick={() => void control.run(() => api.interrupt(threadId))}>
                Interrupt
              </button>
            )}
            <button type="button" disabled={control.busy} onClick={() => void control.run(() => (t?.pinned ? api.unpin(threadId) : api.pin(threadId)))}>
              {t?.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              disabled={control.busy}
              onClick={async () => {
                if (await control.run(() => api.archive(threadId))) onClose();
              }}
            >
              Archive
            </button>
          </span>
        </div>
        {control.error && <span className="error">{control.error}</span>}
      </form>
    </div>
  );
}
