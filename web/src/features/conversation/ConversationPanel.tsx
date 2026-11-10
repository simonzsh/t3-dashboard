import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatMessage, DashboardProvider, HtmlRender, DashboardThread, ThreadDetail, ThreadSettingsBody, TurnStep, UploadedAttachment } from "../../../../shared/api.ts";
import { runActive } from "../../../../shared/status.ts";
import { highlightText } from "../../lib/highlightText.tsx";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { watchSelection } from "./selection.ts";
import { Button, Collapse, Popover, SearchField, Icon, IconButton, Loader, STATUS_ICONS, TOUCH, enter } from "../../ui/index.ts";
import { attachmentUrl } from "../../api/client.ts";
import { type PendingMessage, countSame, isSettled, pendingLabel, sentMessages } from "./pending.ts";
import { MarkdownText } from "./MarkdownText.tsx";
import { QueuedMessages } from "./QueuedMessages.tsx";
import { Composer } from "./Composer.tsx";
import { MessageAttachments } from "./MessageAttachments.tsx";
import { MessageActions } from "./MessageActions.tsx";
import { RewindDialog } from "./RewindDialog.tsx";
import { attachmentFiles, mergeDraft } from "./rewind.ts";
import { PendingRequestView } from "./PendingRequestView.tsx";
import { ApprovalDock, dockedRequest, useQuestionDock } from "./QuestionDock.tsx";
import { RobotVisibilityContext } from "../../lib/robotPreference.ts";
import { WorkingRobot } from "./WorkingRobot.tsx";
import { WorkGroup } from "./Steps.tsx";
import { pendingSecrets } from "./secretRequest.ts";
import { SecretRequestCard } from "./SecretRequestCard.tsx";
import { SubagentRows } from "./SubagentRows.tsx";
import { NoticeRow, PlanCard, TodoCard } from "./TimelineBlocks.tsx";
import { useStickToBottom } from "./useStickToBottom.ts";
import { documentPage, usePoll } from "../../lib/usePoll.ts";
import { singleFlight } from "../../lib/singleFlight.ts";
import { NoticeProvider, useNotify } from "../../lib/notices.tsx";
import { failure, formatMessageTime } from "../../lib/format.ts";
import { useDocumentTheme } from "../../lib/useDocumentTheme.ts";
import { omittedLabel } from "./steps.ts";
import { robotShouldType } from "./steps.ts";
import { awaitingStep, timeline } from "./timeline.ts";
import { LIVE_RELOAD_MS, SEND_POLL_WINDOW_MS, detailRunning, pollDelay } from "./reload.ts";
import { SubagentBar } from "./SubagentBar.tsx";

const SearchQuery = createContext("");

const ROLE_LABELS: Record<string, string> = { user: "You", assistant: "Agent", system: "System" };
// A window remounts when the narrow view switches tabs: keep what it showed.
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
  const query = useContext(SearchQuery);
  const time = formatMessageTime(m.createdAt);
  const attachments = <MessageAttachments threadId={threadId} attachments={m.attachments} />;
  return (
    <div className={`msg ${m.role}`} data-message-id={m.id}>
      {m.role === "user" ? (
        (m.text || m.attachments.length > 0) && (
          <div className="bubble md">
            {attachments}
            {m.text && <MarkdownText text={m.text} query={query} threadId={threadId} breaks />}
          </div>
        )
      ) : (
        <>
          {attachments}
          <div className="md">{m.role === "assistant" ? <MarkdownText text={m.text} query={query} threadId={threadId} /> : highlightText(m.text, query)}</div>
        </>
      )}
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
  const knownSteps = useRef(new Set(detail.steps.map(step => step.id)));
  useLayoutEffect(() => {
    for (const step of detail.steps) knownSteps.current.add(step.id);
  }, [detail.steps]);
  const entries = timeline(detail);
  const typing = robotShouldType(detail.steps.filter(step => step.runId === detail.activity?.runId));
  const waiting = detail.pendingRequests.length > 0 || pendingSecrets(detail.steps).length > 0;
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
            return <WorkGroup typing={typing} showRobot={!waiting} key={entry.steps[0]!.id} steps={entry.steps} threadId={threadId} fresh={!knownSteps.current.has(entry.steps[0]!.id)} live={running && i === entries.length - 1} />;
          case "subagents":
            return <SubagentRows key={entry.steps[0]!.id} steps={entry.steps} threadId={threadId} onOpenThread={onOpenThread} onChanged={onChanged} />;
          case "step":
            if (entry.step.kind === "secret" && entry.step.secret?.status === "pending") return null;
            return <StandaloneStep key={entry.step.id} step={entry.step} threadId={threadId} />;
        }
      })}
      {!waiting && awaitingStep(entries, running) && (
        <div className="working-row">
          <Loader inline label="Thinking" />
          <span>Thinking…</span>
          <WorkingRobot thinking />
        </div>
      )}
    </>
  );
});

function StandaloneStep({ step, threadId }: { step: TurnStep; threadId: string }) {
  switch (step.kind) {
    case "todo":
      return <TodoCard step={step} />;
    case "plan":
      return <PlanCard step={step} threadId={threadId} />;
    case "secret":
      return <SecretRequestCard step={step} threadId={threadId} />;
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
  searchRequest?: number;
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

function Conversation({ searchRequest = 0, threadId, thread, providers, onOpenThread, onTitle }: Props) {
  const showRobot = useContext(RobotVisibilityContext);
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
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTop = useRef(0);
  const lastInput = useRef(-Infinity);
  const smoothing = useRef(false);
  const reaims = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [restore, setRestore] = useState<{ key: number; files: File[] }>({ key: 0, files: [] });
  const [dropping, setDropping] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [selection, setSelection] = useState("");
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const touch = useMediaQuery(TOUCH);
  const quoteAnchor = useRef<HTMLSpanElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const searchBar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!searchOpen || !searchBar.current) return;
    const animation = enter(searchBar.current, { y: -8, duration: 200 });
    return () => animation?.cancel();
  }, [searchOpen]);
  const handledSearchRequest = useRef(searchRequest);
  useLayoutEffect(() => {
    // Activity restarts effects on return; a remount must also ignore old requests.
    if (searchRequest === handledSearchRequest.current) return;
    handledSearchRequest.current = searchRequest;
    if (!searchRequest) return;
    setSearchOpen(true);
    searchField.current?.focus();
  }, [searchRequest]);
  const matches = useMemo(() => query.trim() ? (detail?.messages ?? []).filter((m) => m.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((m) => m.id) : [], [detail, query]);
  useEffect(() => {
    const read = (point: { left: number; top: number } | null) => {
      const selected = window.getSelection();
      const text = selected && scroller.current?.contains(selected.anchorNode) && scroller.current?.contains(selected.focusNode) ? selected.toString().trim() : "";
      setSelection(text);
      if (!text || !selected?.rangeCount) { setSelectionRect(null); return; }
      const rects = selected.getRangeAt(0).getClientRects();
      const composer = touch ? frame.current?.querySelector(".composer-card")?.getBoundingClientRect() : null;
      // iOS owns the menu beside the selection. Keep our touch action by the composer.
      const rect = composer ? { left: composer.left, top: composer.top, width: composer.width, height: 0 } : point ? { ...point, width: 0, height: 0 } : rects[rects.length - 1];
      setSelectionRect(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
    };
    const hide = () => { setSelection(""); setSelectionRect(null); };
    return watchSelection(document, window, read, hide, touch);
  }, [touch]);
  useEffect(() => {
    if (searchOpen) searchField.current?.focus();
  }, [searchOpen]);
  const matchKey = matches.join("\0");
  useEffect(() => {
    const nodes = scroller.current?.querySelectorAll<HTMLElement>("[data-message-id]");
    nodes?.forEach((node) => {
      const active = searchOpen && node.dataset.messageId === matches[matchIndex % (matches.length || 1)];
      node.classList.toggle("search-match", active);
      if (active) {
        stick.current = false;
        smoothing.current = false;
        node.scrollIntoView({ block: "center" });
      }
    });
  }, [matchKey, matchIndex, searchOpen]);

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
  const secrets = pendingSecrets(detail?.steps ?? []);
  const needsInput = secrets.length > 0 || (detail?.pendingRequests.length ?? 0) > 0;
  const docked = detail ? dockedRequest(detail.pendingRequests) : null;
  const question = useQuestionDock(threadId, docked?.category === "user-input" ? docked : null, load);
  const otherRequests = detail ? detail.pendingRequests.filter((r) => r !== docked) : [];

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

  // T3 reads a lone /compact message as the command, not as chat text.
  async function compact(): Promise<void> {
    try {
      await api.sendMessage(threadId, { text: "/compact" });
    } finally {
      void load();
    }
  }

  // Reloads after a failure too: the thread values then replace the picks that failed.
  async function updateSettings(change: ThreadSettingsBody): Promise<void> {
    try {
      await api.updateSettings(threadId, change);
    } finally {
      void load();
    }
  }

  const mainComposer = (
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
      loadCommands={(provider) => api.getComposerCommands(threadId, provider)}
      contextUsage={detail?.contextUsage ?? null}
      onCompact={compact}
      onEscape={() => frame.current?.focus({ preventScroll: true })}
      stash={{ threadId, title: t?.title ?? "" }}
      onStop={() => api.interrupt(threadId)}
      onSettings={updateSettings}
      restore={restore}
      focusKey={restore.key || undefined}
    />
  );

  return (
    // tabIndex -1: Escape in the composer leaves the field here, so the dashboard shortcuts work again.
    <div
      className={dropping ? "conversation dropping" : "conversation"}
      ref={frame}
      tabIndex={-1}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        // Always cancelled: a dropped file must not make the browser leave the page.
        e.preventDefault();
        setDropping(!detail?.subagentThread);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(false);
        // The composer takes its own drop (a second add would attach each file twice); an open dialog takes none.
        if (detail?.subagentThread || (e.target as Element).closest(".composer-card, .dialog-backdrop")) return;
        setRestore((last) => ({ key: last.key + 1, files: [...e.dataTransfer.files] }));
      }}
    >
      {selection && selectionRect && !detail?.subagentThread && <>
        {createPortal(<span ref={quoteAnchor} className="selection-quote-anchor" style={selectionRect} aria-hidden="true" />, document.body)}
        <Popover key={JSON.stringify(selectionRect)} anchor={quoteAnchor} align="end" preferAbove={touch} className={touch ? "selection-quote selection-quote-touch" : "selection-quote"} onClose={() => setSelection("")}>
          <Button size={touch ? "md" : "sm"} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => {
            setDraft(mergeDraft(drafts.get(threadId) ?? "", selection.split("\n").map((line) => `> ${line}`).join("\n") + "\n\n"));
            setSelection("");
            window.getSelection()?.removeAllRanges();
            frame.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
          }}><Icon name="quote" />Cite</Button>
        </Popover>
      </>}
      <Collapse open={searchOpen} duration={200}><div ref={searchBar} className="conversation-tools conversation-search" onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); setSearchOpen(false); frame.current?.focus(); }
        if (e.key === "Enter" && e.target === searchField.current && !e.nativeEvent.isComposing) { e.preventDefault(); setMatchIndex((i) => (i + (e.shiftKey ? matches.length - 1 : 1)) % (matches.length || 1)); }
      }}>
        <SearchField ref={searchField} aria-label="Search in session" placeholder="Search in session…" value={query} onChange={(e) => { setQuery(e.target.value); setMatchIndex(0); }} />
        <span className="conversation-search-count" role="status">{matches.length ? (matchIndex % matches.length) + 1 : 0}/{matches.length}</span>
        <IconButton variant="ghost" label="Previous result" disabled={!matches.length} onClick={() => setMatchIndex((i) => (i + matches.length - 1) % matches.length)}><Icon name="arrowUp" /></IconButton>
        <IconButton variant="ghost" label="Next result" disabled={!matches.length} onClick={() => setMatchIndex((i) => (i + 1) % matches.length)}><Icon name="arrowDown" /></IconButton>
        <IconButton variant="ghost" label="Close search" onClick={() => setSearchOpen(false)}><Icon name="x" /></IconButton>
      </div></Collapse>
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
            // (the sessions grid changed, content moved): it keeps the bottom, or the place, as it was.
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
          {detail && <SearchQuery.Provider value={searchOpen ? query : ""}><Timeline detail={detail} threadId={threadId} running={running} editing={messageEditing} onOpenThread={onOpenThread} onChanged={load} /></SearchQuery.Provider>}
          {detail && !running && pending.map((p) => <PendingBubble key={p.id} message={p} />)}
          {otherRequests.length > 0 && (
            <div className="requests">
              {otherRequests.map((r) => (
                <PendingRequestView key={r.requestId} threadId={threadId} request={r} />
              ))}
            </div>
          )}
          {detail && <QueuedMessages threadId={threadId} queue={detail.queue} held={detail.queueHeld} running={running} onChanged={() => void load()} />}
          {/* Sent during a run: it waits below the queue, as T3 shows it. */}
          {detail && running && pending.map((p) => <PendingBubble key={p.id} message={p} />)}
          {detail && !running && background && !needsInput && (
            <div className="working-row">
              <Loader inline label="Background activity" />
              <span>Running in the background…</span>
              <WorkingRobot background />
            </div>
          )}
          {needsInput && (
            <div className="working-row"><Icon name={STATUS_ICONS.waiting} className="waiting-icon" /><span>Waiting for your reply</span><WorkingRobot waiting /></div>
          )}
          {showRobot && detail && !running && !background && !needsInput && pending.length === 0 && (
            <div className="working-row"><WorkingRobot sleeping /></div>
          )}
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
      {secrets[0] ? (
        <div className="question-docked">
          <SecretRequestCard key={secrets[0].id} step={secrets[0]} threadId={threadId} onAnswered={load} />
          {detail?.subagentThread ? <SubagentBar detail={detail} providers={providers} onOpenThread={onOpenThread} /> : mainComposer}
        </div>
      ) : detail?.subagentThread ? (
        <SubagentBar detail={detail} providers={providers} onOpenThread={onOpenThread} />
      ) : question.composer ? (
        // The question sits on the Composer, whose field is the free answer.
        <div className="question-docked" onKeyDown={question.onKeyDown}>
          {question.card}
          <Composer
            providers={providers}
            selection={detail?.modelSelection ?? null}
            runtimeMode={detail?.runtimeMode ?? null}
            running={false}
            stoppable
            draft={question.composer.draft}
            onDraft={question.composer.onDraft}
            onSend={question.composer.onSend}
            allowEmpty={question.composer.allowEmpty}
            readOnly={question.composer.readOnly}
            placeholder={question.composer.placeholder}
            submitLabel={question.composer.submitLabel}
            noImages
            onEscape={() => frame.current?.focus({ preventScroll: true })}
            onStop={() => api.interrupt(threadId)}
            onSettings={updateSettings}
          />
        </div>
      ) : docked?.category === "approval" ? (
        <div className="question-docked">
          <ApprovalDock key={docked.requestId} threadId={threadId} request={docked} onAnswered={load} />
          {mainComposer}
        </div>
      ) : (
        mainComposer
      )}
      {editing && <RewindDialog message={editing} onClose={() => setEditing(null)} onConfirm={editFromHere} />}
    </div>
  );
}
