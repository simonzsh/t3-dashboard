import { useEffect, useRef, useState } from "react";
import type { DashboardProject, ProjectRef, ProjectRefs, ProjectVcsStatus } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { Icon, Popover, Pressable, Segmented, Switch, TextInput } from "../../ui/index.ts";
import { defaultBaseRef, initialDraft, sanitizeBranchName, showDirtyWarning, type EnvMode, type WorkspaceDraft } from "./workspaceOptions.ts";

const MODES = [
  { id: "local", label: "Current checkout" },
  { id: "worktree", label: "New worktree" },
] as const;

interface Props {
  project: DashboardProject | undefined;
  /** Null while the options are hidden or loading. */
  draft: WorkspaceDraft | null;
  onDraft: (draft: WorkspaceDraft | null) => void;
  /** Why sending must wait (options loading, or a worktree default that cannot load), or null. */
  onBlocked: (reason: string | null) => void;
}

const marks = (r: ProjectRef): string[] => [r.current && "current", r.isDefault && "default", r.remote && "remote", r.worktreePath && !r.current && "worktree"].filter((m): m is string => !!m);

/** Where the new thread runs. Renders nothing for a folder that is not a git repository. */
export function WorkspaceOptions({ project, draft, onDraft, onBlocked }: Props) {
  const api = useApi();
  const root = project?.workspaceRoot;
  const [status, setStatus] = useState<ProjectVcsStatus | null>(null);
  const [current, setCurrent] = useState<ProjectRef | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    onDraft(null);
    setStatus(null);
    setFailure(null);
    onBlocked(null);
    if (!project || !root) return;
    let live = true;
    onBlocked("The branches are still loading. Send again in a moment.");
    void (async () => {
      try {
        const vcs = await api.projectVcsStatus(project.id);
        if (!live) return;
        if (!vcs.isRepo) return onBlocked(null);
        const refs = await api.projectRefs(project.id, {});
        if (!live) return;
        setStatus(vcs);
        setCurrent(defaultBaseRef(refs.refs));
        onDraft(initialDraft(project, refs.refs));
        onBlocked(null);
      } catch (e) {
        if (!live) return;
        const message = e instanceof Error ? e.message : String(e);
        setFailure(message);
        // A worktree default must not silently fall back to the shared checkout.
        onBlocked(project.defaultThreadEnvMode === "worktree" ? `Cannot start a new worktree: ${message}` : null);
      }
    })();
    return () => {
      live = false;
    };
  }, [project?.id, root]);

  if (failure) return <p className="workspace-warning">Could not read the branches: {failure}</p>;
  if (!project || !root || !draft || !status) return null;
  const change = (patch: Partial<WorkspaceDraft>) => onDraft({ ...draft, ...patch });
  const setMode = (envMode: EnvMode) => change({ envMode, ref: envMode === "worktree" ? current : null, newBranch: null });
  const label = draft.newBranch ? `New branch ${draft.newBranch}` : draft.ref ? draft.ref.name : draft.envMode === "worktree" ? "Select a base branch" : (status.branch ?? "Detached HEAD");
  const canOrigin = draft.envMode === "worktree" && status.hasPrimaryRemote;

  return (
    <div className="workspace-options">
      <Segmented label="Workspace" value={draft.envMode} options={MODES} onChange={setMode} />
      <BranchPicker
        projectId={project.id}
        mode={draft.envMode}
        value={draft.ref}
        label={label}
        onRef={(ref) => change({ ref, newBranch: null })}
        onCreate={(name) => change({ ref: null, newBranch: name })}
      />
      {canOrigin && (
        <label className="workspace-origin">
          <Switch checked={draft.startFromOrigin} onChange={(startFromOrigin) => change({ startFromOrigin })} label="Start from origin" />
          <span>Start from origin</span>
        </label>
      )}
      {showDirtyWarning(draft, root, status) && <p className="workspace-warning">This checkout has uncommitted changes. They move with the branch change.</p>}
    </div>
  );
}

interface PickerProps {
  projectId: string;
  mode: EnvMode;
  value: ProjectRef | null;
  label: string;
  onRef: (ref: ProjectRef) => void;
  onCreate: (name: string) => void;
}

function BranchPicker({ projectId, mode, value, label, onRef, onCreate }: PickerProps) {
  const api = useApi();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 200);
  const [result, setResult] = useState<ProjectRefs | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api.projectRefs(projectId, { query: search }).then((r) => live && setResult(r), () => live && setResult(null));
    return () => {
      live = false;
    };
  }, [open, projectId, search]);

  const name = sanitizeBranchName(query);
  const canCreate = mode === "local" && name !== "" && result !== null && !result.refs.some((r) => !r.remote && r.name === name);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="dropdown field workspace-branch">
      <Pressable ref={trigger} className="dropdown-trigger" aria-label={mode === "worktree" ? "Base branch" : "Branch"} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <span className="workspace-from">{mode === "worktree" ? `From${value?.remote ? " (remote)" : ""}` : "Branch"}</span>
        <span className="dropdown-value">{label}</span>
        <Icon name="chevron" className="icon chevron-down" />
      </Pressable>
      {open && (
        <Popover anchor={trigger} className="dropdown-menu" minWidth={210} matchWidth onClose={close}>
          <TextInput className="dropdown-filter" placeholder={mode === "local" ? "Search or create a branch…" : "Search branches…"} aria-label="Search branches" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="dropdown-list" role="listbox" aria-label="Branches">
            {canCreate && (
              <div role="option" aria-selected={false} className="dropdown-option" onMouseDown={(e) => e.preventDefault()} onClick={() => (onCreate(name), close())}>
                <Icon name="plus" className="icon" />
                <span className="dropdown-text">Create branch {name}</span>
              </div>
            )}
            {result?.refs.length === 0 && !canCreate && <div className="dropdown-empty">No match</div>}
            {result?.refs.map((r) => {
              const tags = marks(r);
              return (
              <div key={`${r.remote}:${r.name}`} role="option" aria-selected={r.name === value?.name} className="dropdown-option" onMouseDown={(e) => e.preventDefault()} onClick={() => (onRef(r), close())}>
                <span className="dropdown-text">
                  <span>{r.name}</span>
                  {tags.length > 0 && <small>{tags.join(" · ")}</small>}
                </span>
                {r.name === value?.name && <Icon name="check" className="icon dropdown-check" />}
              </div>
              );
            })}
            {result && result.nextCursor !== null && <div className="dropdown-empty">Type to narrow the list.</div>}
          </div>
        </Popover>
      )}
    </div>
  );
}
