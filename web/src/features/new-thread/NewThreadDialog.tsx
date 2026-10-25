import { useEffect, useState } from "react";
import type { DashboardProject, DashboardProvider, ImageAttachment, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { findModel } from "../conversation/composer.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { loadNewAgentProject, presetSelection, saveNewAgentProject, titleFromMessage } from "./newAgent.ts";
import { Composer } from "../conversation/Composer.tsx";
import { Dialog } from "../../ui/index.ts";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

// Same default as the server when no mode is sent.
const DEFAULT_MODE: RuntimeMode = "full-access";

export function NewThreadDialog({ projects, providers, onClose, onCreated }: Props) {
  const api = useApi();
  const [projectId, setProjectId] = useState(() => loadNewAgentProject(browserStorage(), projects));
  const [selection, setSelection] = useState<ModelSelection | null>(() => presetSelection(projects.find((p) => p.id === projectId), providers));
  const [mode, setMode] = useState<RuntimeMode>(DEFAULT_MODE);
  const [draft, setDraft] = useState("");

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  useEffect(() => {
    if (!findModel(providers, selection)) setSelection(presetSelection(projects.find((p) => p.id === projectId), providers));
  }, [providers]);

  async function send(text: string, attachments: ImageAttachment[]): Promise<void> {
    const title = titleFromMessage(text);
    if (!projectId) throw new Error("Choose a project first.");
    if (!selection) throw new Error("No model is available.");
    if (title === "") throw new Error("Write a message: its first line becomes the title.");
    const { threadId } = await api.createThread({ projectId, title, text, modelSelection: selection, runtimeMode: mode, ...(attachments.length > 0 && { attachments }) });
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
          onPick={(id) => {
            setProjectId(id);
            setSelection(presetSelection(projects.find((p) => p.id === id), providers));
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
        autoFocus
      />
    </Dialog>
  );
}
