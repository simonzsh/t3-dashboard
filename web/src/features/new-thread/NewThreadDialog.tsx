import { useEffect, useState } from "react";
import type { DashboardProject, DashboardProvider, ImageAttachment, LinearIssue, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { loadAssignProject, saveAssignProject } from "../../lib/assignProject.ts";
import { findModel } from "../conversation/composer.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { loadNewAgentProject, presetSelection, saveNewAgentProject, titleFromMessage } from "./newAgent.ts";
import { Composer } from "../conversation/Composer.tsx";
import { Dialog, Icon } from "../../ui/index.ts";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  onClose: () => void;
  onCreated: (threadId: string) => void;
  /** Set when the agent is assigned to a Linear issue: the thread is named after it and links it. */
  issue?: LinearIssue;
}

// Same default as the server when no mode is sent.
const DEFAULT_MODE: RuntimeMode = "full-access";

export function NewThreadDialog({ projects, providers, onClose, onCreated, issue }: Props) {
  const api = useApi();
  // A Linear issue preselects the last project chosen for its team.
  const [projectId, setProjectId] = useState(() => (issue ? loadAssignProject(browserStorage(), issue.team.key, projects) : loadNewAgentProject(browserStorage(), projects)));
  const [selection, setSelection] = useState<ModelSelection | null>(() => presetSelection(projects.find((p) => p.id === projectId), providers));
  const [mode, setMode] = useState<RuntimeMode>(DEFAULT_MODE);
  const [draft, setDraft] = useState("");

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  useEffect(() => {
    if (!findModel(providers, selection)) setSelection(presetSelection(projects.find((p) => p.id === projectId), providers));
  }, [providers]);

  async function send(text: string, attachments: ImageAttachment[]): Promise<void> {
    if (!selection) throw new Error("No model is available.");
    const extra = { runtimeMode: mode, ...(attachments.length > 0 && { attachments }) };
    if (issue) {
      const { threadId } = await api.assignIssue({ issueId: issue.id, projectId, text, modelSelection: selection, ...extra });
      saveAssignProject(browserStorage(), issue.team.key, projectId);
      return onCreated(threadId);
    }
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
    <Dialog title={issue ? "Assign to an agent" : "New Agent"} className="new-agent" onClose={onClose}>
      {issue && (
        <a className="issue-banner" href={issue.url} target="_blank" rel="noreferrer" title="Open in Linear">
          <span className="issue-banner-id">{issue.identifier}</span>
          <span className="issue-banner-title">{issue.title}</span>
          <Icon name="arrowUpRight" />
        </a>
      )}
      <div className="dialog-field">
        <span>Project</span>
        <ProjectPicker
          label="Project"
          projects={projects}
          value={projectId}
          allowNone
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
        placeholder={issue ? "Add instructions for the agent (optional)…" : "Describe the task: the first line becomes the title…"}
        allowEmpty={issue !== undefined}
        autoFocus
      />
    </Dialog>
  );
}
