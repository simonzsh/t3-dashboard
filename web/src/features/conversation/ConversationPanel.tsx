import { memo, useEffect, useRef, useState } from "react";
import type { ChatMessage, DashboardProvider, HtmlRender, DashboardThread, ImageAttachment, SubagentInfo, ThreadDetail, ThreadSettingsBody } from "../../../../shared/api.ts";
import { runActive } from "../../../../shared/status.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Icon, IconButton, Loader } from "../../ui/index.ts";
import { attachmentUrl, mediaUrl } from "../../api/client.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";
import { type PendingMessage, countSame, isSettled, pendingLabel } from "./pending.ts";
import { Composer } from "./Composer.tsx";
import { PendingRequestView } from "./PendingRequestView.tsx";
import { RunActivityView } from "./RunActivity.tsx";
import { SubagentStrip } from "./SubagentStrip.tsx";
import { useStickToBottom } from "./useStickToBottom.ts";
import { usePoll } from "../../lib/usePoll.ts";
import { errorMessage } from "../../lib/format.ts";
import { LIVE_RELOAD_MS, SEND_POLL_WINDOW_MS, pollDelay } from "./reload.ts";

const ROLE_LABELS: Record<string, string> = { user: "You", assistant: "Agent", system: "System" };
// Windows remount when they move between grid, minimized bar and mobile view: keep what they showed.
const detailCache = new Map<string, ThreadDetail>();
const drafts = new Map<string, string>();
const NEAR_BOTTOM_PX = 40;
// A scroll this soon after a wheel, touch, key or pointer input counts as the user's own.
const USER_SCROLL_MS = 150;

// Streaming re-renders the whole list: parse a message again only when its text changes.
const MarkdownText = memo(function MarkdownText({ text, threadId, breaks }: { text: string; threadId: string; breaks?: boolean }) {
  return renderMarkdown(text, { localMedia: (path) => mediaUrl(threadId, path), breaks });
});

function Message({ message: m, threadId }: { message: ChatMessage; threadId: string }) {
  const time = new Date(m.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className={`msg ${m.role}`}>
      {m.attachments.length > 0 && (
        <div className="msg-images">
          {m.attachments.map((file) => (
            <a key={file.id} href={attachmentUrl(threadId, file.id)} target="_blank" rel="noreferrer">
              <img src={attachmentUrl(threadId, file.id)} alt={file.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {m.role === "user" ? m.text && (
          <div className="bubble md">
            <MarkdownText text={m.text} threadId={threadId} breaks />
          </div>
        ) : <div className="md">{m.role === "assistant" ? <MarkdownText text={m.text} threadId={threadId} /> : m.text}</div>}
      <small>
        {ROLE_LABELS[m.role] ?? m.role} · {time}
        {m.streaming && <span className="streaming" role="img" aria-label="Running" />}
      </small>
    </div>
  );
}

// Sandboxed without same-origin: the page's scripts run but cannot reach the dashboard API.
function RenderFrame({ render, threadId }: { render: HtmlRender; threadId: string }) {
  const theme = document.documentElement.getAttribute("data-theme") ?? "light";
  return (
    <div className="msg assistant render">
      <iframe title={render.title || "Page"} src={attachmentUrl(threadId, render.attachmentId, theme)} sandbox="allow-scripts allow-popups" loading="lazy" style={{ height: render.height }} />
    </div>
  );
}

type Entry = { kind: "message"; at: string; message: ChatMessage } | { kind: "render"; at: string; render: HtmlRender };

// Pages sit between messages by time; a stable sort keeps the message order T3 gave.
function timeline(detail: ThreadDetail): Entry[] {
  const entries: Entry[] = [
    ...detail.messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...detail.renders.map((render) => ({ kind: "render" as const, at: render.createdAt, render })),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
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
  /** Live state of the thread: a new object each time the server sends it again. */
  thread: DashboardThread | null;
  providers: DashboardProvider[];
}

export function ConversationPanel({ threadId, thread, providers }: Props) {
  const api = useApi();
  const [detail, setDetail] = useState<ThreadDetail | null>(() => detailCache.get(threadId) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(() => drafts.get(threadId) ?? "");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sentAt, setSentAt] = useState(0);
  const [revealSubagents, setRevealSubagents] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTop = useRef(0);
  const lastInput = useRef(-Infinity);
  const smoothing = useRef(false);
  const [atBottom, setAtBottom] = useState(true);

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
      setLoadError(errorMessage(e));
    }
  }

  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
      setPending([]);
      setSentAt(0);
    };
  }, [threadId]);

  // The live state gives this thread a new object on each server update: reload, debounced.
  const seenThread = useRef(thread);
  useEffect(() => {
    if (seenThread.current === thread) return;
    seenThread.current = thread;
    const timer = setTimeout(() => void load(), LIVE_RELOAD_MS);
    return () => clearTimeout(timer);
  }, [thread]);

  const t = thread ?? detail?.thread ?? null;
  const running = t !== null && runActive(t);
  const background = Boolean(t?.pendingTasks) || (detail?.subagents.some((s) => s.status === "running") ?? false);
  usePoll(load, pollDelay({ running, sentAt, background, now: Date.now() }));

  // A timer closes the send window: a failing load may not render again to close it.
  useEffect(() => {
    if (sentAt === 0) return;
    const timer = setTimeout(() => setSentAt(0), Math.max(0, sentAt + SEND_POLL_WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [sentAt]);

  useStickToBottom(scroller, stick);

  function touched() {
    lastInput.current = performance.now();
    smoothing.current = false;
  }

  function setDraft(value: string) {
    setText(value);
    drafts.set(threadId, value);
  }

  // While a run is active the message steers it instead of waiting in the queue.
  async function send(body: string, attachments: ImageAttachment[]): Promise<void> {
    const entry: PendingMessage = { id: crypto.randomUUID(), text: body, images: attachments.length, sentAt: Date.now(), baseline: countSame(detail?.messages ?? [], body) };
    setPending((list) => [...list, entry]);
    stick.current = true;
    setAtBottom(true);
    try {
      await api.sendMessage(threadId, { text: body, ...(running && { mode: "steer" as const }), ...(attachments.length && { attachments }) });
    } catch (e) {
      setPending((list) => list.filter((p) => p.id !== entry.id));
      throw e;
    }
    setDraft("");
    setSentAt(Date.now());
    void load();
  }

  // Reloads after a failure too: the thread values then replace the picks that failed.
  async function updateSettings(change: ThreadSettingsBody): Promise<void> {
    try {
      await api.updateSettings(threadId, change);
    } finally {
      void load();
    }
  }

  // The subagent state changes in T3 after the stop: reload even when it fails.
  async function stopSubagent(subagent: SubagentInfo): Promise<void> {
    try {
      await (subagent.stop === "thread" ? api.interrupt(threadId) : api.stopSubagent(threadId, subagent.id));
    } finally {
      void load();
    }
  }

  return (
    <div className="conversation">
      <div className="messages-frame">
        <div
          className="messages"
          ref={scroller}
          onWheel={touched}
          onTouchMove={touched}
          onPointerDown={touched}
          onKeyDown={touched}
          onScroll={(e) => {
            const el = e.currentTarget;
            const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
            // Only the user can leave the bottom. A scroll with no input just before it comes from the layout
            // (the desk grid changed, content moved): it keeps the bottom, or the place, as it was.
            if (performance.now() - lastInput.current > USER_SCROLL_MS) {
              lastTop.current = el.scrollTop;
              if (smoothing.current) {
                if (gap > 1) return;
                smoothing.current = false;
                stick.current = true;
                setAtBottom(true);
              } else if (stick.current && gap > 1) el.scrollTop = el.scrollHeight;
              return;
            }
            lastInput.current = performance.now();
            const movedUp = el.scrollTop < lastTop.current - 1 && gap > 1;
            lastTop.current = el.scrollTop;
            stick.current = !movedUp && gap < NEAR_BOTTOM_PX;
            setAtBottom(stick.current);
          }}
        >
          {loadError && <p className="error">{loadError}</p>}
          {detail && detail.messages.length === 0 && detail.renders.length === 0 && <p className="empty">No messages</p>}
          {!detail && !loadError && <Loader />}
          {detail &&
            timeline(detail).map((entry) =>
              entry.kind === "message" ? <Message key={entry.message.id} message={entry.message} threadId={threadId} /> : <RenderFrame key={entry.render.id} render={entry.render} threadId={threadId} />,
            )}
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
        {!atBottom && (
          <IconButton
            className="to-bottom"
            label="Scroll to the latest message"
            onClick={() => {
              smoothing.current = true;
              lastInput.current = -Infinity;
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
            }}
          >
            <Icon name="arrowDown" />
          </IconButton>
        )}
      </div>
      {detail && <SubagentStrip key={threadId} subagents={detail.subagents} reveal={revealSubagents} onStop={stopSubagent} />}
      <Composer
        providers={providers}
        selection={detail?.modelSelection ?? null}
        runtimeMode={detail?.runtimeMode ?? null}
        running={running}
        stoppable={running || Boolean(t?.pendingTasks)}
        draft={text}
        onDraft={setDraft}
        onSend={send}
        onStop={() => api.interrupt(threadId)}
        onSettings={updateSettings}
      />
    </div>
  );
}
