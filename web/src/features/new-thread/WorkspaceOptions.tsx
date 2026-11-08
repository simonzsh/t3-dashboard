import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DashboardProject, ProjectRef, ProjectRefs, ProjectVcsStatus } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { Icon, Popover, Pressable, Switch, TextInput } from "../../ui/index.ts";
import { branchLabel, defaultBaseRef, initialDraft, sanitizeBranchName, showDirtyWarning, type EnvMode, type WorkspaceDraft } from "./workspaceOptions.ts";

const MODES = [
  { id: "local", label: "Current checkout", icon: "folder" },
  { id: "worktree", label: "New worktree", icon: "gitBranch" },
] as const;

interface Props {
  project: DashboardProject | undefined;
  /** Null while the workspace part is hidden or failed to load. */
  draft: WorkspaceDraft | null;
  onDraft: Dispatch<SetStateAction<WorkspaceDraft | null>>;
  /** Why sending must wait (options loading, or a worktree default that cannot load), or null. */
  onBlocked: (reason: string | null) => void;
}

const marks = (r: ProjectRef): string[] => [r.current && "current", r.isDefault && "default", r.remote && "remote", r.worktreePath && !r.current && "worktree"].filter((m): m is string => !!m);

/** The row under the message: checkout and branch. Without a git folder it shows nothing. */
export function WorkspaceOptions({ project, draft, onDraft, onBlocked }: Props) {
  const api = useApi();
  const root = project?.workspaceRoot;
  const [status, setStatus] = useState<ProjectVcsStatus | null>(null);
  const [current, setCurrent] = useState<ProjectRef | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
    setCurrent(null);
    setFailure(null);
    // The row shows at once from the project's default mode; the branch fills in when loaded.
    onDraft(project && root ? initialDraft(project, []) : null);
    onBlocked(null);
    if (!project || !root) return;
    let live = true;
    onBlocked("The branches are still loading. Send again in a moment.");
    void (async () => {
      try {
        const [vcs, refs] = await Promise.all([api.projectVcsStatus(project.id), api.projectRefs(project.id, {})]);
        if (!live) return;
        if (!vcs.isRepo) {
          onDraft(null);
          return onBlocked(null);
        }
        const base = defaultBaseRef(refs.refs);
        setStatus(vcs);
        setCurrent(base);
        // The user may have switched mode while loading: only fill a missing base.
        onDraft((d) => (d && d.envMode === "worktree" && !d.ref ? { ...d, ref: base } : d));
        onBlocked(null);
      } catch (e) {
        if (!live) return;
        const message = e instanceof Error ? e.message : String(e);
        setFailure(message);
        onDraft(null);
        // A worktree default must not silently fall back to the shared checkout.
        onBlocked(project.defaultThreadEnvMode === "worktree" ? `Cannot start a new worktree: ${message}` : null);
      }
    })();
    return () => {
      live = false;
    };
  }, [project?.id, root]);

  const change = (patch: Partial<WorkspaceDraft>) => onDraft((d) => d && { ...d, ...patch });
  const setMode = (envMode: EnvMode) => change({ envMode, ref: envMode === "worktree" ? current : null, newBranch: null });

  const ready = project && root && draft;
  if (!ready && !failure) return null;

  return (
    <div className="workspace-options">
      <div className="workspace-bar">
        <div className="workspace-group">
          {ready && <ModeMenu value={draft.envMode} onChange={setMode} />}
        </div>
        {ready && (
          <BranchPicker
            projectId={project.id}
            mode={draft.envMode}
            value={draft.ref}
            label={branchLabel(draft, status)}
            loading={status === null}
            canOrigin={draft.envMode === "worktree" && !!status?.hasPrimaryRemote}
            startFromOrigin={draft.startFromOrigin}
            onOrigin={(startFromOrigin) => change({ startFromOrigin })}
            onRef={(ref) => change({ ref, newBranch: null })}
            onCreate={(name) => change({ ref: null, newBranch: name })}
          />
        )}
      </div>
      {failure && <p className="workspace-warning">Could not read the branches: {failure}</p>}
      {ready && status && showDirtyWarning(draft, root, status) && <p className="workspace-warning">This checkout has uncommitted changes. They move with the branch change.</p>}
    </div>
  );
}

function ModeMenu({ value, onChange }: { value: EnvMode; onChange: (mode: EnvMode) => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = MODES.find((m) => m.id === value) ?? MODES[0];
  return (
    <>
      <Pressable ref={anchor} className="dropdown-trigger" aria-label="Workspace" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={selected.icon} />
        <span>{selected.label}</span>
        <Icon name="chevron" className="icon chevron-down" />
      </Pressable>
      {open && (
        <Popover anchor={anchor} className="dropdown-menu" minWidth={170} onClose={() => setOpen(false)}>
          <div className="dropdown-list" role="menu" aria-label="Workspace">
            {MODES.map((m) => (
              <Pressable key={m.id} role="menuitemradio" aria-checked={m.id === value} className="dropdown-option workspace-item" onClick={() => (setOpen(false), onChange(m.id))}>
                <Icon name={m.icon} />
                <span className="dropdown-text">{m.label}</span>
                {m.id === value && <Icon name="check" className="icon dropdown-check" />}
              </Pressable>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

interface PickerProps {
  projectId: string;
  mode: EnvMode;
  value: ProjectRef | null;
  label: string;
  loading: boolean;
  canOrigin: boolean;
  startFromOrigin: boolean;
  onOrigin: (on: boolean) => void;
  onRef: (ref: ProjectRef) => void;
  onCreate: (name: string) => void;
}

function BranchPicker({ projectId, mode, value, label, loading, canOrigin, startFromOrigin, onOrigin, onRef, onCreate }: PickerProps) {
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
    <div className="workspace-branch">
      <Pressable ref={trigger} className="dropdown-trigger" disabled={loading} aria-label={mode === "worktree" ? "Base branch" : "Branch"} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <Icon name="gitBranch" />
        <span className="dropdown-value">{label}</span>
        <Icon name="chevron" className="icon chevron-down" />
      </Pressable>
      {open && (
        <Popover anchor={trigger} align="end" className="dropdown-menu" minWidth={240} onClose={close}>
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
          {canOrigin && (
            <label className="workspace-origin">
              <Switch checked={startFromOrigin} onChange={onOrigin} label="Start from origin" />
              <span>Start from origin</span>
            </label>
          )}
        </Popover>
      )}
    </div>
  );
}
