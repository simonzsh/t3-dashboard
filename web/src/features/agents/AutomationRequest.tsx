import { useState, type FormEvent } from "react";
import type { DashboardProject, DashboardProvider, ModelDefaults } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { loadProjectChoice, saveProjectChoice } from "../../lib/projectChoice.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { Button, NO_AUTOFILL, TextInput } from "../../ui/index.ts";
import { presetSelection } from "../new-thread/newAgent.ts";

const KEY = "t3-dashboard-automation-project";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  defaults: ModelDefaults;
  onOpen: (id: string, addOnly: boolean) => void;
  /** Called after T3 accepted the request, so the list can refresh. */
  onSent: () => void;
}

/** Asks an agent, in a new thread, to schedule a reminder or a routine. */
export function AutomationRequest({ projects, providers, defaults, onOpen, onSent }: Props) {
  const api = useApi();
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState(() => loadProjectChoice(browserStorage(), KEY, projects));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentThread, setSentThread] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim() === "" || busy) return;
    const modelSelection = presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection);
    if (!modelSelection) return setError("No model is available.");
    setBusy(true);
    setError(null);
    try {
      const { threadId } = await api.requestAutomation({ text, projectId, modelSelection, ...(defaults.runtimeMode && { runtimeMode: defaults.runtimeMode }) });
      saveProjectChoice(browserStorage(), KEY, projectId);
      setText("");
      setSentThread(threadId);
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form {...NO_AUTOFILL} className="auto-request" onSubmit={submit}>
      <div className="auto-request-row">
        <TextInput aria-label="New reminder or routine" placeholder="New reminder or routine…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={text.trim() === ""}>
          Add
        </Button>
      </div>
      <ProjectPicker label="Project" projects={projects} value={projectId} allowNone onPick={setProjectId} />
      {error && <p className="notice error-notice">{error}</p>}
      {sentThread && !error && (
        <p className="auto-request-note">
          Sent to the agent. It shows here once scheduled.{" "}
          <Button variant="link" size="sm" onClick={(e) => onOpen(sentThread, e.shiftKey)}>
            Open
          </Button>
        </p>
      )}
    </form>
  );
}
