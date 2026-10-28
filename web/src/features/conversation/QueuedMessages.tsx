import { useState } from "react";
import type { QueuedMessage } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { attachmentUrl } from "../../api/client.ts";
import { useAction } from "../../lib/useAction.ts";
import { Button, Icon, IconButton, TextArea } from "../../ui/index.ts";
import { MarkdownText } from "./MarkdownText.tsx";

interface Props {
  threadId: string;
  queue: QueuedMessage[];
  /** After a Stop, T3 holds the queue until "Send now". */
  held: boolean;
  running: boolean;
  /** Called after each action, even a failed one: the queue may have moved on in T3. */
  onChanged: () => void;
}

export function QueuedMessages({ threadId, queue, held, running, onChanged }: Props) {
  if (queue.length === 0) return null;
  return (
    <section className="queue" aria-label={`Up next: ${queue.length} queued message${queue.length === 1 ? "" : "s"}`}>
      <div className="queue-head">
        Up next · {queue.length} queued
        {held && " · paused"}
      </div>
      <ol>
        {queue.map((item) => (
          <QueuedItem key={item.runId} threadId={threadId} item={item} running={running} onChanged={onChanged} />
        ))}
      </ol>
    </section>
  );
}

function QueuedItem({ threadId, item, running, onChanged }: { threadId: string; item: QueuedMessage; running: boolean; onChanged: () => void }) {
  const api = useApi();
  const { busy, run } = useAction("update the queued message");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const act = (fn: () => Promise<unknown>) => run(fn).finally(onChanged);
  const startEdit = () => {
    setDraft(item.text);
    setEditing(true);
  };
  const save = async () => {
    if (await act(() => api.editQueued(threadId, item.runId, draft))) setEditing(false);
  };

  return (
    <li className="msg user queued">
      {item.attachments.length > 0 && (
        <div className="msg-images">
          {item.attachments.map((file) => (
            <a key={file.id} href={attachmentUrl(threadId, file.id)} target="_blank" rel="noreferrer">
              <img src={attachmentUrl(threadId, file.id)} alt={file.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <div className={editing ? "bubble md editing" : "bubble md"}>
        {editing ? (
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label="Queued message"
            autoFocus
            rows={3}
          />
        ) : (
          <MarkdownText text={item.text} threadId={threadId} breaks />
        )}
      </div>
      {editing ? (
        <div className="buttons">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" loading={busy} disabled={draft.trim() === ""} onClick={() => void save()}>
            Save
          </Button>
        </div>
      ) : (
        <div className="queued-actions">
          {item.editable && (
            <IconButton label="Edit queued message" size="sm" variant="ghost" disabled={busy} onClick={startEdit}>
              <Icon name="pencil" />
            </IconButton>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            tooltip={running ? "Send as a steer instead" : "Start a turn with this message"}
            onClick={() => void act(() => api.sendQueued(threadId, item.runId))}
          >
            {running ? "Steer" : "Send now"}
          </Button>
          <IconButton label="Remove from queue" size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => api.cancelQueued(threadId, item.runId))}>
            <Icon name="trash" />
          </IconButton>
        </div>
      )}
    </li>
  );
}
