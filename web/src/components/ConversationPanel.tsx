import { memo, useEffect, useRef, useState } from "react";
import type { ChatMessage, DashboardEvent, DashboardThread, ThreadDetail } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { renderMarkdown } from "../markdown.tsx";
import { PendingRequestView } from "./PendingRequestView.tsx";
import { SubagentStrip } from "./SubagentStrip.tsx";
import { useAction } from "./useAction.ts";

const ROLE_LABELS: Record<string, string> = { user: "You", assistant: "Agent", system: "System" };
// Subagent progress does not always reach the shell stream: poll while one runs.
const SUBAGENT_POLL_MS = 4000;
// Windows remount when they move between grid, minimized bar and mobile view: keep what they showed.
const detailCache = new Map<string, ThreadDetail>();
const drafts = new Map<string, string>();
const NEAR_BOTTOM_PX = 40;

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

  // Bumped on every thread change and cleanup: a late response from an older effect is dropped.
  const epoch = useRef(0);

  async function load() {
    const mine = epoch.current;
    try {
      const next = await api.getThread(threadId);
      if (mine !== epoch.current) return;
      detailCache.set(threadId, next);
      setDetail(next);
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
  const running = t?.bucket === "running" || Boolean(t?.activeRunId);

  // Poll only while the thread itself is active: a stale subagent must not keep it going.
  const subagentRunning = running && (detail?.subagents.some((s) => s.status === "running") ?? false);
  useEffect(() => {
    if (!subagentRunning) return;
    const id = setInterval(() => void load(), SUBAGENT_POLL_MS);
    return () => clearInterval(id);
  }, [subagentRunning, threadId]);

  // Follow new messages unless the user scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [detail?.messages.length, detail?.messages.at(-1)?.text, detail?.pendingRequests.length]);

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
          <Message key={m.id} message={m} />
        ))}
        {detail && detail.pendingRequests.length > 0 && (
          <div className="requests">
            {detail.pendingRequests.map((r) => (
              <PendingRequestView key={r.requestId} threadId={threadId} request={r} />
            ))}
          </div>
        )}
      </div>
      {detail && <SubagentStrip key={threadId} subagents={detail.subagents} />}
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
