import { useEffect, useRef, useState, type RefObject } from "react";
import { stashPreview, type StashEntry } from "../../../../shared/stash.ts";
import { moveActive } from "../../lib/dropdown.ts";
import { relativeTime } from "../../lib/format.ts";
import { Icon, IconButton, Popover, Pressable } from "../../ui/index.ts";

interface Props {
  entries: StashEntry[];
  anchor: RefObject<HTMLElement | null>;
  shortcut: string;
  onRestore: (entry: StashEntry) => void;
  onDelete: (entry: StashEntry) => void;
  onClose: () => void;
}

/** The stashed prompts above the composer: arrows pick a row, Enter restores it, Escape closes. */
export function StashDrawer({ entries, anchor, shortcut, onRestore, onDelete, onClose }: Props) {
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const latest = useRef({ entries, active, onRestore });
  latest.current = { entries, active, onRestore };

  useEffect(() => setActive((i) => Math.min(i, Math.max(0, entries.length - 1))), [entries.length]);
  // Braces: recent Chrome returns a Promise from scrollIntoView, which React would call as a cleanup.
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Capture phase: the composer field must not also send on this Enter.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { entries, active, onRestore } = latest.current;
      if (e.isComposing || entries.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive(moveActive(entries.length, active, e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        e.stopPropagation();
        const entry = entries[active];
        if (entry) onRestore(entry);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const now = new Date();
  return (
    <Popover anchor={anchor} className="stash-drawer" matchWidth fitWidth preferAbove onClose={onClose}>
      <h3 className="stash-title">Stashed prompts</h3>
      {entries.length === 0 ? (
        <p className="stash-empty">Nothing stashed yet. Press {shortcut} with a prompt in the composer to stash it.</p>
      ) : (
        <ul ref={list} className="stash-list" aria-label="Stashed prompts">
          {entries.map((entry, i) => (
            <li key={entry.id} className={`stash-row${i === active ? " active" : ""}`} onMouseEnter={() => setActive(i)}>
              <Pressable className="stash-restore" aria-label={`Restore stashed prompt: ${stashPreview(entry)}`} onClick={() => onRestore(entry)}>
                <span className="stash-text">{stashPreview(entry)}</span>
                <small className="stash-meta">
                  {relativeTime(entry.createdAt, now)}
                  {entry.threadTitle !== "" && ` · ${entry.threadTitle}`}
                  {entry.uploads.length > 0 && ` · ${entry.uploads.length} file${entry.uploads.length === 1 ? "" : "s"}`}
                </small>
              </Pressable>
              <IconButton label="Delete stashed prompt" tooltip="Delete" variant="ghost" size="sm" onClick={() => onDelete(entry)}>
                <Icon name="x" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
