import { useEffect, useState } from "react";
import type { DashboardProject, DashboardProvider, ModelDefaults, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { loadProjectChoice, saveProjectChoice } from "../../lib/projectChoice.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { findModel } from "../conversation/composer.ts";
import { Composer } from "../conversation/Composer.tsx";
import { Dialog } from "../../ui/index.ts";
import { presetSelection } from "./newAgent.ts";

const KEY = "t3-dashboard-automation-project";
const MAX_TEXT = 2000;
// Same default as the server when no mode is sent, used when T3 has none.
const DEFAULT_MODE: RuntimeMode = "full-access";

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
  const [projectId, setProjectId] = useState(() => loadProjectChoice(browserStorage(), KEY, projects));
  const [selection, setSelection] = useState<ModelSelection | null>(() => presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  const [mode, setMode] = useState<RuntimeMode>(defaults.runtimeMode ?? DEFAULT_MODE);
  const [draft, setDraft] = useState("");

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  useEffect(() => {
    if (!findModel(providers, selection)) setSelection(presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  }, [providers]);

  async function send(text: string): Promise<void> {
    if (!selection) throw new Error("No model is available.");
    if (text.length > MAX_TEXT) throw new Error(`The request is too long: ${MAX_TEXT} characters at most.`);
    await api.requestAutomation({ text, projectId, modelSelection: selection, runtimeMode: mode });
    saveProjectChoice(browserStorage(), KEY, projectId);
    onSent();
    onClose();
  }

  function changeSettings(change: ThreadSettingsBody) {
    if (change.modelSelection) setSelection(change.modelSelection);
    if (change.runtimeMode) setMode(change.runtimeMode);
  }

  return (
    <Dialog title="New automation" className="new-agent" onClose={onClose}>
      <div className="dialog-field">
        <span>Project</span>
        <ProjectPicker
          label="Project"
          projects={projects}
          value={projectId}
          allowNone
          onPick={(id) => {
            setProjectId(id);
            setSelection(presetSelection(projects.find((p) => p.id === id), providers, defaults.selection));
          }}
        />
      </div>
      <Composer
        providers={providers}
        selection={selection}
        runtimeMode={mode}
        running={false}
        draft={draft}
        onDraft={setDraft}
        onSend={send}
        onSettings={changeSettings}
        errorResetKey={projectId}
        placeholder="Every weekday at 9:00, summarize my Linear tickets…"
        noImages
        autoFocus
      />
    </Dialog>
  );
}
