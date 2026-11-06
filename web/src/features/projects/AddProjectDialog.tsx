import { useState } from "react";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { Dialog, TextInput } from "../../ui/index.ts";
import { addLabel, folderTitle, isFolderPath } from "./addProject.ts";
import { FolderField, type FolderKind } from "./FolderField.tsx";

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
  const [kind, setKind] = useState<FolderKind | null>(null);
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
      <FolderField autoFocus value={path} onChange={setPath} onKind={setKind} onKeyDown={onEnter} missingHint="This folder does not exist yet: it will be created." />
      <label className="dialog-field">
        <span>Title</span>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onEnter} placeholder={folderTitle(path) || "The folder's name"} />
      </label>
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}
