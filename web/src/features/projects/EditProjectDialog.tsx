import { useState } from "react";
import type { DashboardProject, ProjectIconSpec } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { Dialog, TextInput } from "../../ui/index.ts";
import { isFolderPath } from "./addProject.ts";
import { FolderField, type FolderKind } from "./FolderField.tsx";
import { IconPicker } from "./IconPicker.tsx";
import { editBody } from "./projectIcons.ts";

interface Props {
  project: DashboardProject;
  onClose: () => void;
}

/** Edits a project's title, folder and icon. The list follows through T3's project events. */
export function EditProjectDialog({ project, onClose }: Props) {
  const api = useApi();
  const [title, setTitle] = useState(project.title);
  const [path, setPath] = useState(project.workspaceRoot ?? "");
  const [icon, setIcon] = useState<ProjectIconSpec | null>(project.iconSpec ?? null);
  const [kind, setKind] = useState<FolderKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = editBody(project, { title, path, icon });
  // The folder is checked only when it changes: a moved folder must not block a rename.
  // An unknown folder kind is allowed: the server checks the folder anyway.
  const valid = title.trim() !== "" && (!body?.path || (isFolderPath(path) && kind !== "file" && kind !== "missing"));

  async function submit() {
    if (busy || !body || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateProject(project.id, body);
      onClose();
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
    <Dialog title="Edit project" className="add-project" onClose={onClose} onCancel={onClose} primary={{ label: busy ? "Saving…" : "Save", onClick: () => void submit(), disabled: busy || !body || !valid }}>
      <label className="dialog-field">
        <span>Title</span>
        <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onEnter} />
      </label>
      <FolderField value={path} onChange={setPath} onKind={setKind} onKeyDown={onEnter} missingHint="This folder does not exist." />
      <div className="dialog-field">
        <span>Icon</span>
        <IconPicker title={title} value={icon} onChange={setIcon} current={project.icon} />
      </div>
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}
