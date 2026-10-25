import { useEffect, useState } from "react";
import type { DashboardProject, DashboardProvider } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { projectOptions } from "../dropdown.ts";
import { NO_AUTOFILL } from "../noAutofill.ts";
import { Dropdown } from "./Dropdown.tsx";
import { useAction } from "./useAction.ts";
import { useEscape } from "./useEscape.ts";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

function presetFor(project: DashboardProject | undefined, providers: DashboardProvider[]): { provider: string; model: string } {
  const sel = project?.defaultModelSelection;
  if (sel && providers.some((p) => p.instanceId === sel.instanceId && p.models.some((m) => m.slug === sel.model))) return { provider: sel.instanceId, model: sel.model };
  const first = providers[0];
  return { provider: first?.instanceId ?? "", model: first?.models[0]?.slug ?? "" };
}

export function NewThreadDialog({ projects, providers, defaultProjectId, onClose, onCreated }: Props) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [{ provider, model }, setChoice] = useState(() => presetFor(projects.find((p) => p.id === defaultProjectId), providers));
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const action = useAction();
  useEscape(onClose);
  const models = providers.find((p) => p.instanceId === provider)?.models ?? [];

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  useEffect(() => {
    if (!models.some((m) => m.slug === model)) setChoice(presetFor(projects.find((p) => p.id === projectId), providers));
  }, [providers]);
  const valid = projectId && provider && model && title.trim() && text.trim();

  async function create() {
    let id = "";
    const ok = await action.run(async () => {
      const res = await api.createThread({
        projectId,
        title: title.trim(),
        text: text.trim(),
        modelSelection: { instanceId: provider, model },
      });
      id = res.threadId;
    });
    if (ok) onCreated(id);
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog"
        autoComplete="off"
        role="dialog"
        aria-modal="true"
        aria-label="New Agent"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h2>New Agent</h2>
        <div className="dialog-field">
          <span>Project</span>
          <Dropdown
            className="field"
            label="Project"
            placeholder="Select a project"
            value={projectId || null}
            options={projectOptions(projects)}
            filterable
            onPick={(id) => {
              setProjectId(id);
              setChoice(presetFor(projects.find((p) => p.id === id), providers));
            }}
          />
        </div>
        <div className="dialog-field">
          <span>Provider</span>
          <Dropdown
            className="field"
            label="Provider"
            value={provider || null}
            options={providers.map((p) => ({ id: p.instanceId, label: p.displayName }))}
            onPick={(id) => setChoice({ provider: id, model: providers.find((p) => p.instanceId === id)?.models[0]?.slug ?? "" })}
          />
        </div>
        <div className="dialog-field">
          <span>Model</span>
          <Dropdown className="field" label="Model" value={model || null} options={models.map((m) => ({ id: m.slug, label: m.name }))} onPick={(id) => setChoice({ provider, model: id })} />
        </div>
        <label>
          Title
          <input {...NO_AUTOFILL} type="text" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          First message
          <textarea {...NO_AUTOFILL} required value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!valid || action.busy}>
            Create
          </button>
          {action.error && <span className="error">{action.error}</span>}
        </div>
      </form>
    </div>
  );
}
