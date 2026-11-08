import { useEffect, useState } from "react";
import type { DashboardProject, DashboardProvider, LinearIssue, ModelDefaults, ModelSelection, RuntimeMode, ThreadSettingsBody, UploadedAttachment } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { loadAssignProject, saveAssignProject } from "../../lib/assignProject.ts";
import { findModel } from "../conversation/composer.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { loadNewAgentProject, presetSelection, saveNewAgentProject, titleFromMessage } from "./newAgent.ts";
import { Composer } from "../conversation/Composer.tsx";
import { AddProjectDialog } from "../projects/AddProjectDialog.tsx";
import { Dialog, Icon, Switch } from "../../ui/index.ts";
import { WorkspaceOptions } from "./WorkspaceOptions.tsx";
import { toWorkspaceChoice, type WorkspaceDraft } from "./workspaceOptions.ts";

// Same default as the server when no mode is sent, used when T3 has none.
const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  /** T3 Code's default model and access. */
  defaults: ModelDefaults;
  onClose: () => void;
  onCreated: (threadId: string) => void;
  /** Set when the agent is assigned to a Linear issue: the thread is named after it and links it. */
  issue?: LinearIssue;
  /** The project to preselect, in place of the last one chosen. */
  projectId?: string | null;
}

export function NewThreadDialog({ projects, providers, defaults, onClose, onCreated, issue, projectId: preset = null }: Props) {
  const api = useApi();
  // A Linear issue preselects the last project chosen for its team.
  const [projectId, setProjectId] = useState(() => (issue ? loadAssignProject(browserStorage(), issue.team.key, projects) : (preset ?? loadNewAgentProject(browserStorage(), projects))));
  const [selection, setSelection] = useState<ModelSelection | null>(() => presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  const [mode, setMode] = useState<RuntimeMode>(defaults.runtimeMode ?? DEFAULT_RUNTIME_MODE);
  const [draft, setDraft] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceDraft | null>(null);
  const [plan, setPlan] = useState(false);
  // Each project pick moves the focus to the message.
  // A preset project needs no pick: the field gets the focus at once (focusKey 1).
  const [picks, setPicks] = useState(preset ? 1 : 0);
  // The form takes the dialog's place: two dialogs cannot stack. The state stays here.
  const [addingProject, setAddingProject] = useState(false);

  // A created project reaches `projects` with the next SSE event: take its model then.
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    const project = created ? projects.find((p) => p.id === created) : undefined;
    if (!project) return;
    setCreated(null);
    setSelection(presetSelection(project, providers, defaults.selection));
  }, [created, projects]);

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  useEffect(() => {
    if (!findModel(providers, selection)) setSelection(presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  }, [providers]);

  async function send(text: string, uploads: UploadedAttachment[]): Promise<void> {
    if (!selection) throw new Error("No model is available.");
    const root = projects.find((p) => p.id === projectId)?.workspaceRoot;
    const choice = workspace && root ? toWorkspaceChoice(workspace, root) : undefined;
    const extra = { runtimeMode: mode, ...(uploads.length > 0 && { uploads }), ...(choice && { workspace: choice }), ...(plan && { interactionMode: "plan" as const }) };
    if (issue) {
      const { threadId } = await api.assignIssue({ issueId: issue.id, projectId, text, modelSelection: selection, ...extra });
      saveAssignProject(browserStorage(), issue.team.key, projectId);
      return onCreated(threadId);
    }
    const title = titleFromMessage(text);
    if (title === "") throw new Error("Write a message.");
    const { threadId } = await api.createThread({ projectId, title, text, modelSelection: selection, ...extra });
    saveNewAgentProject(browserStorage(), projectId);
    onCreated(threadId);
  }

  function changeSettings(change: ThreadSettingsBody) {
    if (change.modelSelection) setSelection(change.modelSelection);
    if (change.runtimeMode) setMode(change.runtimeMode);
  }

  return (
    <>
      {addingProject && (
        <AddProjectDialog
          onClose={() => setAddingProject(false)}
          onCreated={(id) => {
            setAddingProject(false);
            setProjectId(id);
            setCreated(id);
            setPicks((n) => n + 1);
          }}
        />
      )}
      {/* Hidden, not unmounted: the composer frees its attachments on unmount. */}
      <Dialog title={issue ? "Assign to an agent" : "New Session"} className="new-agent" onClose={onClose} hidden={addingProject}>
        {issue && (
          <a className="issue-banner" href={issue.url} target="_blank" rel="noreferrer">
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
            defaultOpen={!preset && picks === 0}
            onPicked={() => setPicks((n) => n + 1)}
            onNewProject={() => setAddingProject(true)}
            onPick={(id) => {
              setProjectId(id);
              setSelection(presetSelection(projects.find((p) => p.id === id), providers, defaults.selection));
            }}
          />
        </div>
        <WorkspaceOptions project={projects.find((p) => p.id === projectId)} draft={workspace} onDraft={setWorkspace} />
        <label className="workspace-origin">
          <Switch checked={plan} onChange={setPlan} label="Plan mode" />
          <span>Plan mode: the agent proposes a plan before it changes anything</span>
        </label>
        <Composer
          providers={providers}
          selection={selection}
          runtimeMode={mode}
          running={false}
          draft={draft}
          onDraft={setDraft}
          onSend={send}
          onSettings={changeSettings}
          errorResetKey={`${projectId}:${workspace?.envMode ?? ""}`}
          placeholder={issue ? "Add instructions for the agent (optional)…" : "Describe the task…"}
          allowEmpty={issue !== undefined}
          focusKey={picks || undefined}
        />
      </Dialog>
    </>
  );
}
