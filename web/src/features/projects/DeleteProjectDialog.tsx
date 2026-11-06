import { useState } from "react";
import type { DashboardProject } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { Dialog } from "../../ui/index.ts";

interface Props {
  project: DashboardProject;
  /** Every session of the project, settled ones included. */
  sessions: number;
  onClose: () => void;
}

/** Asks before deleting a project and its sessions; the folder stays on disk. */
export function DeleteProjectDialog({ project, sessions, onClose }: Props) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProject(project.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const what = sessions > 0 ? `Delete "${project.title}" and its ${sessions} ${sessions === 1 ? "session" : "sessions"}?` : `Delete "${project.title}"?`;
  return (
    <Dialog title="Delete project?" className="add-project" onClose={onClose} onCancel={onClose} primary={{ label: busy ? "Deleting…" : "Delete", onClick: () => void submit(), disabled: busy, danger: true }}>
      <p>{what}</p>
      <p className="hint">The sessions, archived ones included, are deleted from T3 Code. The folder stays on disk. This cannot be undone.</p>
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}
