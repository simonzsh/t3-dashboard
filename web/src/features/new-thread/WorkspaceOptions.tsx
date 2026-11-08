import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { DashboardProject, ProjectRef, ProjectRefs, ProjectVcsStatus } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { Dropdown, Icon, Switch } from "../../ui/index.ts";
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
  const options = MODES.map((m) => ({ id: m.id, label: m.label, icon: <Icon name={m.icon} /> }));
  return <Dropdown label="Workspace" value={value} options={options} onPick={(id) => onChange(id as EnvMode)} />;
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

const CREATE = "create:";
const refId = (r: ProjectRef) => `${r.remote ? "remote" : "local"}:${r.name}`;

function BranchPicker({ projectId, mode, value, label, loading, canOrigin, startFromOrigin, onOrigin, onRef, onCreate }: PickerProps) {
  const api = useApi();
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 200);
  const [result, setResult] = useState<ProjectRefs | null>(null);

  useEffect(() => {
    let live = true;
    api.projectRefs(projectId, { query: search }).then((r) => live && setResult(r), () => live && setResult(null));
    return () => {
      live = false;
    };
  }, [projectId, search]);

  const name = sanitizeBranchName(query);
  const canCreate = mode === "local" && name !== "" && result !== null && !result.refs.some((r) => !r.remote && r.name === name);
  const refs = result?.refs ?? [];
  const options = [
    ...(canCreate ? [{ id: CREATE + name, label: `Create branch ${name}`, icon: <Icon name="plus" /> }] : []),
    ...refs.map((r) => ({ id: refId(r), label: r.name, ...(marks(r).length > 0 && { description: marks(r).join(" · ") }) })),
  ];
  const footer = (
    <>
      {result && result.nextCursor !== null && <div className="dropdown-empty">Type to narrow the list.</div>}
      {canOrigin && (
        <label className="workspace-origin">
          <Switch checked={startFromOrigin} onChange={onOrigin} label="Start from origin" />
          <span>Start from origin</span>
        </label>
      )}
    </>
  );

  return (
    <Dropdown
      className="workspace-branch"
      label={mode === "worktree" ? "Base branch" : "Branch"}
      value={value ? refId(value) : null}
      valueLabel={label}
      icon={<Icon name="gitBranch" />}
      options={options}
      disabled={loading}
      filterable
      searchPlaceholder={mode === "local" ? "Search or create a branch…" : "Search branches…"}
      onQuery={setQuery}
      footer={canOrigin || result?.nextCursor != null ? footer : undefined}
      align="end"
      onPick={(id) => {
        if (id.startsWith(CREATE)) return onCreate(id.slice(CREATE.length));
        const ref = refs.find((r) => refId(r) === id);
        if (ref) onRef(ref);
      }}
    />
  );
}
