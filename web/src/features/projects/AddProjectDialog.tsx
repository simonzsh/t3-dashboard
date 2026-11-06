import { useEffect, useRef, useState } from "react";
import type { FolderBrowseResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { Dialog, Icon, Pressable, TextInput } from "../../ui/index.ts";
import { addLabel, folderTitle, isFolderPath } from "./addProject.ts";

const BROWSE_DELAY_MS = 150;

interface Props {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

/** Adds a T3 project from a folder; a missing folder is created. */
export function AddProjectDialog({ onClose, onCreated }: Props) {
  const api = useApi();
  const [path, setPath] = useState("~/");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The answer is tied to the text it answered: a late answer never labels newer text.
  const [answer, setAnswer] = useState<{ query: string; result: FolderBrowseResult } | null>(null);
  const pathField = useRef<HTMLInputElement>(null);
  const query = useDebouncedValue(path.trim(), BROWSE_DELAY_MS);

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

  const known = answer?.query === path.trim() ? answer.result : null;
  const kind = known?.kind ?? null;
  const valid = isFolderPath(path) && kind !== "file";

  async function submit() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const { projectId } = await api.createProject({ path: path.trim(), ...(title.trim() !== "" && { title: title.trim() }) });
      onCreated(projectId);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const onEnter = (e: { key: string; preventDefault: () => void }) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void submit();
  };

  return (
    <Dialog title="Add project" className="add-project" onClose={onClose} onCancel={onClose} primary={{ label: addLabel(kind), onClick: () => void submit(), disabled: busy || !valid }}>
      <label className="dialog-field">
        <span>Folder</span>
        <TextInput ref={pathField} autoFocus value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={onEnter} placeholder="~/src/my-project" spellCheck={false} />
      </label>
      {known && known.entries.length > 0 && (
        <div className="folder-list" aria-label="Folders">
          {known.entries.map((entry) => (
            <Pressable
              key={entry.path}
              className="folder-option"
              onClick={() => {
                setPath(`${entry.path}/`);
                pathField.current?.focus();
              }}
            >
              <Icon name="folder" />
              <span>{entry.name}</span>
            </Pressable>
          ))}
        </div>
      )}
      {kind === "missing" && <p className="hint">This folder does not exist yet: it will be created.</p>}
      {kind === "file" && <p className="hint">This path is a file, not a folder.</p>}
      <label className="dialog-field">
        <span>Title</span>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onEnter} placeholder={folderTitle(path)} />
      </label>
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}
