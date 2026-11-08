import { useEffect, useRef, type RefObject } from "react";
import { stashPreview, type StashEntry } from "../../../../shared/stash.ts";
import { relativeTime } from "../../lib/format.ts";
import { Icon, IconButton, Popover, Pressable, useListNav } from "../../ui/index.ts";

interface Props {
  entries: StashEntry[];
  anchor: RefObject<HTMLElement | null>;
  onRestore: (entry: StashEntry) => void;
  onDelete: (entry: StashEntry) => void;
  onClose: () => void;
}

/** The stashed prompts above the composer: arrows pick a row, Enter restores it, Escape closes. */
export function StashDrawer({ entries, anchor, onRestore, onDelete, onClose }: Props) {
  // Home and End stay with the caret of the composer field.
  const nav = useListNav(entries.length, { initial: 0, homeEnd: false, onPick: (i) => onRestore(entries[i]!), itemId: (i) => `stash-row-${i}` });
  const latest = useRef({ entries, nav });
  latest.current = { entries, nav };

  // Capture phase: the composer field must not also send on this Enter.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { entries, nav } = latest.current;
      if (e.isComposing || entries.length === 0 || (e.key === "Enter" && e.target instanceof HTMLButtonElement)) return;
      if (nav.onKeyDown(e) && e.key === "Enter") e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const now = new Date();
  return (
    <Popover anchor={anchor} className="stash-drawer" matchWidth fitWidth preferAbove onClose={onClose}>
      <h3 className="stash-title">Stashed prompts</h3>
      <ul className="stash-list" aria-label="Stashed prompts">
          {entries.map((entry, i) => (
            <li key={entry.id} id={`stash-row-${i}`} className={`stash-row${i === nav.active ? " active" : ""}`} onMouseEnter={() => nav.hover(i)}>
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
    </Popover>
  );
}
