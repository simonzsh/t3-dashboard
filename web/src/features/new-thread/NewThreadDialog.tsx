import { useEffect, useState } from "react";
import type { DashboardProject, DashboardProvider, ModelDefaults, ModelSelection, RuntimeMode, ThreadSettingsBody, UploadedAttachment } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { findModel } from "../conversation/composer.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { DEFAULT_RUNTIME_MODE, loadNewAgentProject, presetSelection, saveNewAgentProject, titleFromMessage } from "./newAgent.ts";
import { Composer } from "../conversation/Composer.tsx";
import { Dialog } from "../../ui/index.ts";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  /** T3 Code's default model and access. */
  defaults: ModelDefaults;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

export function NewThreadDialog({ projects, providers, defaults, onClose, onCreated }: Props) {
  const api = useApi();
  const [projectId, setProjectId] = useState(() => loadNewAgentProject(browserStorage(), projects));
  const [selection, setSelection] = useState<ModelSelection | null>(() => presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  const [mode, setMode] = useState<RuntimeMode>(defaults.runtimeMode ?? DEFAULT_RUNTIME_MODE);
  const [draft, setDraft] = useState("");
  // Each project pick moves the focus to the message.
  const [picks, setPicks] = useState(0);

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  useEffect(() => {
    if (!findModel(providers, selection)) setSelection(presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  }, [providers]);

  async function send(text: string, uploads: UploadedAttachment[]): Promise<void> {
    if (!selection) throw new Error("No model is available.");
    const extra = { runtimeMode: mode, ...(uploads.length > 0 && { uploads }) };
    const title = titleFromMessage(text);
    if (title === "") throw new Error("Write a message: its first line becomes the title.");
    const { threadId } = await api.createThread({ projectId, title, text, modelSelection: selection, ...extra });
    saveNewAgentProject(browserStorage(), projectId);
    onCreated(threadId);
  }

  function changeSettings(change: ThreadSettingsBody) {
    if (change.modelSelection) setSelection(change.modelSelection);
    if (change.runtimeMode) setMode(change.runtimeMode);
  }

  return (
    <Dialog title="New Agent" className="new-agent" onClose={onClose}>
      <div className="dialog-field">
        <span>Project</span>
        <ProjectPicker
          label="Project"
          projects={projects}
          value={projectId}
          allowNone
          defaultOpen
          onPicked={() => setPicks((n) => n + 1)}
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
        placeholder="Describe the task: the first line becomes the title…"
        focusKey={picks || undefined}
      />
    </Dialog>
  );
}
