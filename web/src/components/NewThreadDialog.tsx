import { useEffect, useState } from "react";
import type { DashboardProject, DashboardProvider, ImageAttachment, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { browserStorage } from "../assignProject.ts";
import { findModel } from "../composer.ts";
import { projectOptions } from "../dropdown.ts";
import { loadNewAgentProject, presetSelection, saveNewAgentProject, titleFromMessage } from "../newAgent.ts";
import { Composer } from "./Composer.tsx";
import { Dropdown } from "../ui/index.ts";
import { useAction } from "./useAction.ts";
import { useEscape } from "../ui/index.ts";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

// Same default as the server when no mode is sent.
const DEFAULT_MODE: RuntimeMode = "full-access";

export function NewThreadDialog({ projects, providers, onClose, onCreated }: Props) {
  const [projectId, setProjectId] = useState(() => loadNewAgentProject(browserStorage(), projects));
  const [selection, setSelection] = useState<ModelSelection | null>(() => presetSelection(projects.find((p) => p.id === projectId), providers));
  const [mode, setMode] = useState<RuntimeMode>(DEFAULT_MODE);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = useAction();
  useEscape(onClose);

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  useEffect(() => {
    if (!findModel(providers, selection)) setSelection(presetSelection(projects.find((p) => p.id === projectId), providers));
  }, [providers]);

  async function send(text: string, attachments: ImageAttachment[]): Promise<boolean> {
    const title = titleFromMessage(text);
    setError(!projectId ? "Choose a project first." : !selection ? "No model is available." : title === "" ? "Write a message: its first line becomes the title." : null);
    if (!projectId || !selection || title === "") return false;
    let threadId = "";
    const ok = await action.run(async () => {
      threadId = (await api.createThread({ projectId, title, text, modelSelection: selection, runtimeMode: mode, ...(attachments.length > 0 && { attachments }) })).threadId;
    });
    if (!ok) return false;
    saveNewAgentProject(browserStorage(), projectId);
    onCreated(threadId);
    return true;
  }

  async function changeSettings(change: ThreadSettingsBody): Promise<boolean> {
    if (change.modelSelection) setSelection(change.modelSelection);
    if (change.runtimeMode) setMode(change.runtimeMode);
    return true;
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog new-agent" role="dialog" aria-modal="true" aria-label="New Agent" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>New Agent</h2>
          <button type="button" className="icon-button dialog-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="dialog-field">
          <span>Project</span>
          <Dropdown
            className="field"
            label="Project"
            placeholder={projects.length === 0 ? "No T3 project yet" : "Choose a project…"}
            value={projectId || null}
            options={projectOptions(projects)}
            filterable
            disabled={projects.length === 0}
            onPick={(id) => {
              setProjectId(id);
              setSelection(presetSelection(projects.find((p) => p.id === id), providers));
              setError(null);
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
          onStop={async () => true}
          onSettings={changeSettings}
          onReload={() => {}}
          error={error ?? action.error}
          placeholder="Describe the task: the first line becomes the title…"
          autoFocus
        />
      </div>
    </div>
  );
}
