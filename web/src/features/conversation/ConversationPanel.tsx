import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, DashboardProvider, HtmlRender, DashboardThread, ThreadDetail, ThreadSettingsBody, TurnStep, UploadedAttachment } from "../../../../shared/api.ts";
import { runActive } from "../../../../shared/status.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Icon, IconButton, Loader } from "../../ui/index.ts";
import { attachmentUrl, rawAttachmentUrl } from "../../api/client.ts";
import { type PendingMessage, countSame, isSettled, pendingLabel, sentMessages } from "./pending.ts";
import { MarkdownText } from "./MarkdownText.tsx";
import { QueuedMessages } from "./QueuedMessages.tsx";
import { Composer } from "./Composer.tsx";
import { MessageActions } from "./MessageActions.tsx";
import { RewindDialog } from "./RewindDialog.tsx";
import { attachmentFiles, mergeDraft } from "./rewind.ts";
import { PendingRequestView } from "./PendingRequestView.tsx";
import { WorkGroup } from "./Steps.tsx";
import { NoticeRow, PlanCard, SubagentBlock, TodoCard } from "./TimelineBlocks.tsx";
import { useStickToBottom } from "./useStickToBottom.ts";
import { documentPage, usePoll } from "../../lib/usePoll.ts";
import { singleFlight } from "../../lib/singleFlight.ts";
import { NoticeProvider, useNotify } from "../../lib/notices.tsx";
import { failure, formatBytes, formatMessageTime } from "../../lib/format.ts";
import { useDocumentTheme } from "../../lib/useDocumentTheme.ts";
import { omittedLabel } from "./steps.ts";
import { awaitingStep, timeline } from "./timeline.ts";
import { LIVE_RELOAD_MS, SEND_POLL_WINDOW_MS, detailRunning, pollDelay } from "./reload.ts";

const ROLE_LABELS: Record<string, string> = { user: "You", assistant: "Agent", system: "System" };
// Windows remount when they move between grid, minimized bar and mobile view: keep what they showed.
const detailCache = new Map<string, ThreadDetail>();
const drafts = new Map<string, string>();
const NEAR_BOTTOM_PX = 40;
// A scroll this soon after a wheel, touch, key or pointer input counts as the user's own.
const USER_SCROLL_MS = 150;
const MAX_REAIMS = 3;

interface MessageEditing {
  onEdit: (message: ChatMessage) => void;
  disabled: boolean;
}

const Message = memo(function Message({ message: m, threadId, editing }: { message: ChatMessage; threadId: string; editing: MessageEditing }) {
  const time = formatMessageTime(m.createdAt);
  const images = m.attachments.filter((file) => file.kind === "image");
  const files = m.attachments.filter((file) => file.kind === "file");
  return (
    <div className={`msg ${m.role}`}>
      {images.length > 0 && (
        <div className="msg-images">
          {images.map((file) => (
            <a key={file.id} href={attachmentUrl(threadId, file.id)} target="_blank" rel="noreferrer">
              <img src={attachmentUrl(threadId, file.id)} alt={file.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="msg-files">
          {files.map((file) => (
            <a key={file.id} className="msg-file" href={rawAttachmentUrl(threadId, file.id)} download={file.name}>
              <Icon name="paperclip" />
              <span className="msg-file-name">{file.name}</span>
              {file.sizeBytes !== null && <span className="msg-file-size">{formatBytes(file.sizeBytes)}</span>}
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
        <MessageActions message={m} onEdit={editing.onEdit} editDisabled={editing.disabled} />
      </small>
    </div>
  );
});

// Sandboxed without same-origin: the page's scripts run but cannot reach the dashboard API.
const RenderFrame = memo(function RenderFrame({ render, threadId }: { render: HtmlRender; threadId: string }) {
  const theme = useDocumentTheme();
  return (
    <div className="msg assistant render">
      <iframe title={render.title || "Page"} src={attachmentUrl(threadId, render.attachmentId, theme)} sandbox="allow-scripts allow-popups" loading="lazy" style={{ height: render.height }} />
    </div>
  );
});

// A fragment, so each message stays a direct child of .messages. A keystroke does not render the list.
const Timeline = memo(function Timeline({ detail, threadId, running, editing, onOpenThread, onChanged }: { detail: ThreadDetail; threadId: string; running: boolean; editing: MessageEditing; onOpenThread?: (id: string) => void; onChanged: () => void }) {
  const entries = timeline(detail);
  return (
    <>
      {detail.stepsOmitted > 0 && <div className="steps-omitted">{omittedLabel(detail.stepsOmitted)}</div>}
      {entries.map((entry, i) => {
        switch (entry.kind) {
          case "message":
            return <Message key={entry.message.id} message={entry.message} threadId={threadId} editing={editing} />;
          case "render":
            return <RenderFrame key={entry.render.id} render={entry.render} threadId={threadId} />;
          case "work":
            // Keyed by its first step: the group keeps its open state while later steps join it.
            return <WorkGroup key={entry.steps[0]!.id} steps={entry.steps} threadId={threadId} live={running && i === entries.length - 1} />;
          case "step":
            return <StandaloneStep key={entry.step.id} step={entry.step} threadId={threadId} onOpenThread={onOpenThread} onChanged={onChanged} />;
        }
      })}
      {awaitingStep(entries, running) && (
        <div className="working-row">
          <Loader inline label="Working" />
          Working…
        </div>
      )}
    </>
  );
});

function StandaloneStep({ step, threadId, onOpenThread, onChanged }: { step: TurnStep; threadId: string; onOpenThread?: (id: string) => void; onChanged: () => void }) {
  switch (step.kind) {
    case "todo":
      return <TodoCard step={step} />;
    case "plan":
      return <PlanCard step={step} threadId={threadId} />;
    case "subagent":
      return <SubagentBlock step={step} threadId={threadId} onOpenThread={onOpenThread} onChanged={onChanged} />;
    default:
      return <NoticeRow step={step} />;
  }
}

function PendingBubble({ message: p }: { message: PendingMessage }) {
  return (
    <div className="msg user pending">
      <div className="bubble">{p.text}</div>
      <small>{pendingLabel(p.attachments)}</small>
    </div>
  );
}

interface Props {
  threadId: string;
  /** Live state of the thread: a new object each time the server sends it again. */
  thread: DashboardThread | null;
  providers: DashboardProvider[];
  /** Opens another thread, such as a subagent's. */
  onOpenThread?: (id: string) => void;
  /** The name of a thread the shell does not list, once the detail gives it. */
  onTitle?: (title: string) => void;
}

// Its errors show in a banner inside the conversation, not over the whole dashboard.
export function ConversationPanel(props: Props) {
  return (
    <NoticeProvider local>
      <Conversation {...props} />
    </NoticeProvider>
  );
}

function Conversation({ threadId, thread, providers, onOpenThread, onTitle }: Props) {
  const api = useApi();
  const [detail, setDetail] = useState<ThreadDetail | null>(() => detailCache.get(threadId) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const notify = useNotify();
  // Once per distinct error: the poll keeps failing the same way while the server is down.
  useEffect(() => {
    if (loadError) notify(loadError);
  }, [loadError]);
  const [text, setText] = useState(() => drafts.get(threadId) ?? "");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sentAt, setSentAt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTop = useRef(0);
  const lastInput = useRef(-Infinity);
  const smoothing = useRef(false);
  const reaims = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [restore, setRestore] = useState<{ key: number; files: File[] }>({ key: 0, files: [] });

  // Bumped on every thread change and cleanup: a late response from an older effect is dropped.
  const epoch = useRef(0);

  const unmounted = useRef(false);
  // Reset on mount too: StrictMode runs the cleanup once before the real mount.
  useEffect(() => {
    unmounted.current = false;
    return () => void (unmounted.current = true);
  }, []);

  async function loadOnce() {
    if (unmounted.current) return;
    const mine = epoch.current;
    try {
      const next = await api.getThread(threadId);
      if (mine !== epoch.current) return;
      detailCache.set(threadId, next);
      setDetail(next);
      setPending((list) => {
        const now = Date.now();
        const rest = list.filter((p) => !isSettled(p, sentMessages(next), now));
        return rest.length === list.length ? list : rest;
      });
      setLoadError(null);
    } catch (e) {
      if (mine !== epoch.current) return;
      setLoadError(failure("load the conversation", e));
    }
  }

  // Overlapping triggers (live reload, poll, send) share one request; a late one adds a single rerun.
  const latestLoad = useRef(loadOnce);
  latestLoad.current = loadOnce;
  const [load] = useState(() => singleFlight(() => latestLoad.current()));
  // A background tab skips reloads; the page shows again, it catches up.
  const staleWhileHidden = useRef(false);

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
    const timer = setTimeout(() => {
      if (documentPage.hidden()) staleWhileHidden.current = true;
      else void load();
    }, LIVE_RELOAD_MS);
    return () => clearTimeout(timer);
  }, [thread]);

  const t = thread ?? detail?.thread ?? null;
  // Not in the shell (a subagent's thread): only its detail says whether it runs.
  const running = t !== null ? runActive(t) : detailRunning(detail);
  const background = Boolean(t?.pendingTasks) || (detail?.subagents.some((s) => s.status === "running") ?? false);
  const delay = pollDelay({ running, sentAt, background, now: Date.now() });
  usePoll(load, delay);

  const title = thread ? null : (detail?.title ?? null);
  useEffect(() => {
    if (title) onTitle?.(title);
  }, [title]);

  const messageEditing = useMemo(() => ({ onEdit: setEditing, disabled: running }), [running]);

  const polling = useRef(false);
  polling.current = delay !== null;
  useEffect(
    () =>
      documentPage.onChange(() => {
        if (documentPage.hidden() || !staleWhileHidden.current) return;
        staleWhileHidden.current = false;
        // An active poll catches up by itself: a second load here would only double the request.
        if (!polling.current) void load();
      }),
    [],
  );

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

  async function send(body: string, uploads: UploadedAttachment[]): Promise<void> {
    const entry: PendingMessage = { id: crypto.randomUUID(), text: body, attachments: uploads.length, sentAt: Date.now(), baseline: countSame(detail ? sentMessages(detail) : [], body) };
    setPending((list) => [...list, entry]);
    stick.current = true;
    setAtBottom(true);
    try {
      // No mode: a message sent during a run waits in T3's queue.
      await api.sendMessage(threadId, { text: body, ...(uploads.length && { uploads }) });
    } catch (e) {
      setPending((list) => list.filter((p) => p.id !== entry.id));
      throw e;
    }
    setDraft("");
    setSentAt(Date.now());
    void load();
  }

  // Files are read first: a failed read must not leave the thread rewound with the attachments lost.
  async function editFromHere(message: ChatMessage, restoreFiles: boolean): Promise<void> {
    const files = await attachmentFiles(threadId, message.attachments);
    try {
      await api.rewind(threadId, { messageId: message.id, restoreFiles });
    } finally {
      void load();
    }
    // The draft may have changed while the rewind ran: merge into the latest one.
    setDraft(mergeDraft(drafts.get(threadId) ?? "", message.text));
    setRestore((last) => ({ key: last.key + 1, files }));
  }

  // Reloads after a failure too: the thread values then replace the picks that failed.
  async function updateSettings(change: ThreadSettingsBody): Promise<void> {
    try {
      await api.updateSettings(threadId, change);
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
          onScrollEnd={(e) => {
            // Content can still grow while the smooth scroll runs (images, renders): aim again.
            const el = e.currentTarget;
            if (smoothing.current && el.scrollHeight - el.scrollTop - el.clientHeight > 1 && reaims.current < MAX_REAIMS) {
              reaims.current++;
              el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }
          }}
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
          {!detail && loadError && <p className="empty">This conversation could not be loaded.</p>}
          {detail && detail.messages.length === 0 && detail.renders.length === 0 && detail.steps.length === 0 && <p className="empty">No messages</p>}
          {!detail && !loadError && <Loader />}
          {detail && <Timeline detail={detail} threadId={threadId} running={running} editing={messageEditing} onOpenThread={onOpenThread} onChanged={load} />}
          {detail && !running && pending.map((p) => <PendingBubble key={p.id} message={p} />)}
          {detail && detail.pendingRequests.length > 0 && (
            <div className="requests">
              {detail.pendingRequests.map((r) => (
                <PendingRequestView key={r.requestId} threadId={threadId} request={r} />
              ))}
            </div>
          )}
          {detail && <QueuedMessages threadId={threadId} queue={detail.queue} held={detail.queueHeld} running={running} onChanged={() => void load()} />}
          {/* Sent during a run: it waits below the queue, as T3 shows it. */}
          {detail && running && pending.map((p) => <PendingBubble key={p.id} message={p} />)}
        </div>
        {!atBottom && (
          <IconButton
            className="to-bottom"
            label="Scroll to the latest message"
            onClick={() => {
              smoothing.current = true;
              reaims.current = 0;
              lastInput.current = -Infinity;
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
            }}
          >
            <Icon name="arrowDown" />
          </IconButton>
        )}
      </div>
      <Composer
        providers={providers}
        selection={detail?.modelSelection ?? null}
        runtimeMode={detail?.runtimeMode ?? null}
        running={running}
        stoppable={running || Boolean(t?.pendingTasks)}
        draft={text}
        onDraft={setDraft}
        onSend={send}
        searchFiles={(q) => api.searchFiles(threadId, q, 20).then((r) => r.entries)}
        onStop={() => api.interrupt(threadId)}
        onSettings={updateSettings}
        restore={restore}
        focusKey={restore.key || undefined}
      />
      {editing && <RewindDialog message={editing} onClose={() => setEditing(null)} onConfirm={editFromHere} />}
    </div>
  );
}
