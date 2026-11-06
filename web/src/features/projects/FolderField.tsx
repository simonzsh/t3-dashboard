import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FolderBrowseResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { Icon, Pressable, TextInput } from "../../ui/index.ts";
import { isFolderPath } from "./addProject.ts";

const BROWSE_DELAY_MS = 150;

export type FolderKind = FolderBrowseResult["kind"];

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** What the typed path is, once known; null while unknown. */
  onKind: (kind: FolderKind | null) => void;
  /** The hint under the field when the folder is missing. */
  missingHint: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}

/** A folder path field with debounced folder suggestions and a hint for a missing folder or a file. */
export function FolderField({ value, onChange, onKind, missingHint, onKeyDown, autoFocus }: Props) {
  const api = useApi();
  // The answer is tied to the text it answered: a late answer never labels newer text.
  const [answer, setAnswer] = useState<{ query: string; result: FolderBrowseResult } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const query = useDebouncedValue(value.trim(), BROWSE_DELAY_MS);

  useEffect(() => {
    if (!isFolderPath(query)) return setAnswer(null);
    let stale = false;
    api.browseFolders(query).then(
      (result) => !stale && setAnswer({ query, result }),
      () => !stale && setAnswer(null),
    );
    return () => {
      stale = true;
    };
  }, [query]);

  const known = answer?.query === value.trim() ? answer.result : null;
  const kind = known?.kind ?? null;
  useEffect(() => onKind(kind), [kind]);

  return (
    <>
      <label className="dialog-field">
        <span>Folder</span>
        <TextInput ref={field} autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} placeholder="~/src/my-project" spellCheck={false} />
      </label>
      {known && known.entries.length > 0 && (
        <div className="folder-list" aria-label="Folders">
          {known.entries.map((entry) => (
            <Pressable
              key={entry.path}
              className="folder-option"
              onClick={() => {
                onChange(`${entry.path}/`);
                field.current?.focus();
              }}
            >
              <Icon name="folder" />
              <span>{entry.name}</span>
            </Pressable>
          ))}
        </div>
      )}
      {kind === "missing" && <p className="hint">{missingHint}</p>}
      {kind === "file" && <p className="hint">This path is a file, not a folder.</p>}
    </>
  );
}
