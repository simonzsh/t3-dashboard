import { useState } from "react";
import type { DashboardProject, DashboardProvider, ModelDefaults } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { loadProjectChoice, saveProjectChoice } from "../../lib/projectChoice.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { isSendKey } from "../conversation/composer.ts";
import { Dialog, TextArea } from "../../ui/index.ts";
import { presetSelection } from "./newAgent.ts";

const KEY = "t3-dashboard-automation-project";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  defaults: ModelDefaults;
  onClose: () => void;
  /** Called after T3 accepted the request, so the list can refresh. */
  onSent: () => void;
}

/** New automation: asks an agent, in a new thread, to schedule a reminder or a routine. */
export function NewAutomationDialog({ projects, providers, defaults, onClose, onSent }: Props) {
  const api = useApi();
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState(() => loadProjectChoice(browserStorage(), KEY, projects));
  const touch = useMediaQuery("(pointer: coarse)");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (text.trim() === "" || busy) return;
    const modelSelection = presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection);
    if (!modelSelection) return setError("No model is available.");
    setBusy(true);
    setError(null);
    try {
      await api.requestAutomation({ text, projectId, modelSelection, ...(defaults.runtimeMode && { runtimeMode: defaults.runtimeMode }) });
      saveProjectChoice(browserStorage(), KEY, projectId);
      onSent();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title="New automation" className="new-agent" onClose={onClose} onCancel={onClose} primary={{ label: busy ? "Sending…" : "Create", onClick: () => void submit(), disabled: busy || text.trim() === "" }}>
      <div className="dialog-field">
        <span>Project</span>
        <ProjectPicker label="Project" projects={projects} value={projectId} allowNone onPick={setProjectId} />
      </div>
      <label className="dialog-field">
        <span>Request</span>
        <TextArea
          aria-label="Request"
          rows={5}
          autoFocus
          maxLength={2000}
          placeholder="Every weekday at 9:00, summarize my Linear tickets…" value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint={touch ? "enter" : "send"}
          onKeyDown={(e) => {
            if (isSendKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, touch)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </label>
      {error && <p className="notice error-notice">{error}</p>}
    </Dialog>
  );
}
