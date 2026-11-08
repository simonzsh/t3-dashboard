import { useState } from "react";
import type { DashboardProject, ProjectIconSpec } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { Dialog, isTouch, TextInput } from "../../ui/index.ts";
import { IconPicker } from "./IconPicker.tsx";
import { editBody } from "./projectIcons.ts";

interface Props {
  project: DashboardProject;
  onClose: () => void;
}

/** Edits a project's title and icon (like T3 Code, not its folder). The list follows through T3's project events. */
export function EditProjectDialog({ project, onClose }: Props) {
  const api = useApi();
  const [title, setTitle] = useState(project.title);
  const [icon, setIcon] = useState<ProjectIconSpec | null>(project.iconSpec ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = editBody(project, { title, icon });
  const valid = title.trim() !== "";

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
        <TextInput autoFocus={!isTouch()} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onEnter} />
      </label>
      <div className="dialog-field">
        <span>Icon</span>
        <IconPicker title={title} value={icon} onChange={setIcon} current={project.icon} />
      </div>
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}
