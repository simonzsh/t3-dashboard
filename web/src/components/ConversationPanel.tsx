import { useEffect, useRef, useState } from "react";
import type { DashboardEvent, DashboardThread, ThreadDetail } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { useAction } from "./useAction.ts";

interface Props {
  threadId: string;
  thread: DashboardThread | null;
  lastEvent: DashboardEvent | null;
  onClose: () => void;
}

export function ConversationPanel({ threadId, thread, lastEvent, onClose }: Props) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"queue" | "steer">("queue");
  const bottom = useRef<HTMLDivElement>(null);
  const send = useAction();
  const control = useAction();

  async function load() {
    try {
      setDetail(await api.getThread(threadId));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    setDetail(null);
    void load();
  }, [threadId]);

  // A live update of this thread means new messages: reload, debounced.
  useEffect(() => {
    if (lastEvent?.type !== "threads" || !lastEvent.data.upserted.some((t) => t.id === threadId)) return;
    const id = setTimeout(() => void load(), 500);
    return () => clearTimeout(id);
  }, [lastEvent]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length, detail?.messages.at(-1)?.text]);

  const t = thread ?? detail?.thread ?? null;
  const running = t?.bucket === "running" || Boolean(t?.activeRunId);

  async function submit() {
    const body = text.trim();
    if (!body) return;
    const ok = await send.run(() => api.sendMessage(threadId, running ? { text: body, mode } : { text: body }));
    if (ok) setText("");
  }

  return (
    <aside className="panel" aria-label="Conversation">
      <div className="panel-head">
        <h2>{t?.title || "(sans titre)"}</h2>
        <button disabled={control.busy} onClick={() => void control.run(() => (t?.pinned ? api.unpin(threadId) : api.pin(threadId)))}>
          {t?.pinned ? "Désépingler" : "Épingler"}
        </button>
        {running && (
          <button className="danger" disabled={control.busy} onClick={() => void control.run(() => api.interrupt(threadId))}>
            Interrompre
          </button>
        )}
        <button
          disabled={control.busy}
          onClick={async () => {
            if (await control.run(() => api.archive(threadId))) onClose();
          }}
        >
          Archiver
        </button>
        <button onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        {control.error && <span className="error">{control.error}</span>}
      </div>
      <div className="messages">
        {loadError && <p className="error">{loadError}</p>}
        {detail && detail.messages.length === 0 && <p className="empty">Aucun message</p>}
        {!detail && !loadError && <p className="empty">Chargement…</p>}
        {detail?.messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <small>
              {m.role} · {new Date(m.createdAt).toLocaleString("fr-FR")}
              {m.streaming ? " · en cours…" : ""}
            </small>
            {m.text}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Envoyer un message à l'agent…" aria-label="Message" />
        <div className="row">
          {running && (
            <select aria-label="Mode d'envoi" value={mode} onChange={(e) => setMode(e.target.value as "queue" | "steer")}>
              <option value="queue">Mettre en file</option>
              <option value="steer">Orienter le run</option>
            </select>
          )}
          <button className="primary" type="submit" disabled={send.busy || !text.trim()}>
            Envoyer
          </button>
          {send.error && <span className="error">{send.error}</span>}
        </div>
      </form>
    </aside>
  );
}
