import { useState } from "react";
import type { DashboardProject } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import type { DropdownOption } from "../../lib/dropdown.ts";
import { Badge, Dropdown, Icon, IconButton, ListPage, Loader, Sheet, Tabs } from "../../ui/index.ts";
import { ChainView } from "./ChainView.tsx";
import { FileDetail } from "./FileDetail.tsx";
import { FileTree } from "./FileTree.tsx";
import { buildTree, issueTotals, scopeFiles, statusByServer } from "./setupTree.ts";
import { useAgentSetup, type AgentSetupState } from "./useAgentSetup.ts";

type View = "files" | "effective";
const VIEWS = [{ id: "files", label: "Files" }, { id: "effective", label: "Effective" }] as const;
const USER_SCOPE = "user";
const PROJECT_PREFIX = "project:";

interface PageProps {
  state: AgentSetupState;
  /** For the project icons; the inventory only knows ids and titles. */
  projects: DashboardProject[];
  /** Phone layout: the file list, and the picked file in a sheet. */
  compact: boolean;
  now: Date;
}

/** The page without its data hook, so a test can give it any state. */
export function AgentSetupPage({ state, projects, compact, now }: PageProps) {
  const { value: inv, error, loading, mcp, refresh } = state;
  const [scope, setScope] = useState(USER_SCOPE);
  const [view, setView] = useState<View>("files");
  const [picked, setPicked] = useState<string | null>(null);

  const project = inv?.projects.find((p) => `${PROJECT_PREFIX}${p.projectId}` === scope) ?? null;
  const projectId = project?.projectId ?? null;
  const shownView: View = projectId ? view : "files";
  const files = inv ? scopeFiles(inv, projectId) : [];
  const file = (picked && inv?.files[picked]) || (!compact ? files[0] : undefined);
  const statuses = statusByServer(mcp);

  const options: DropdownOption[] = [
    { id: USER_SCOPE, label: "User", description: "Applies to every project", icon: <Icon name="user" /> },
    ...(inv?.projects ?? []).map((p) => ({
      id: `${PROJECT_PREFIX}${p.projectId}`,
      label: p.title,
      group: "Projects",
      icon: <ProjectIcon icon={projects.find((x) => x.id === p.projectId)?.icon ?? null} title={p.title} />,
    })),
  ];
  const totals = issueTotals(files, inv?.issues);
  const issueCount = totals.error + totals.warning + totals.info;

  function choose(id: string) {
    setScope(id);
    setPicked(null);
  }

  const head = (
    <>
      <div className="as-bar">
        <Dropdown label="Scope" value={project ? scope : USER_SCOPE} options={options} onPick={choose} />
        {projectId && <Tabs label="View" idPrefix="as-view" value={shownView} options={VIEWS} onChange={setView} />}
        <span className="as-bar-end">
          {inv && (
            <Badge variant={issueCount === 0 ? "done" : totals.error > 0 ? "error" : "neutral"}>
              {issueCount === 0 ? "No issues" : issueCount === 1 ? "1 issue" : `${issueCount} issues`}
            </Badge>
          )}
          {inv && <span className="as-muted">Read {relativeTime(inv.readAt, now)}</span>}
          <IconButton size="sm" variant="ghost" label="Refresh setup" tooltip="Refresh setup" disabled={loading} aria-busy={loading} onClick={refresh}>
            <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
          </IconButton>
        </span>
      </div>
      {error && <p className="auto-error" role="alert">Could not read the setup. {error}</p>}
      {inv?.partial && <p className="as-note">The size budget ran out: some file contents are left out.</p>}
    </>
  );

  // The shared ListPage puts the bar where every page starts; the tree and the file share its scroll box.
  return (
    <ListPage className="as-page" aria-label="Setup" headClassName="as-head" bodyClassName="as-scroll" head={head}>
      {!inv ? (
        loading && <Loader />
      ) : (
        <>
          <div className="as-list" role="tabpanel" id="as-view-panel" aria-labelledby={`as-view-${shownView}`}>
            {shownView === "files" ? (
              files.length === 0 ? (
                <div className="empty-state">
                  <Icon name="fileText" />
                  <strong>No files found</strong>
                  <span>No instruction, settings or MCP file exists in this scope.</span>
                </div>
              ) : (
                <FileTree nodes={buildTree(files, inv.home)} picked={file?.id ?? null} onPick={setPicked} />
              )
            ) : (
              projectId && <ChainView inv={inv} projectId={projectId} statuses={statuses} picked={file?.id ?? null} onPick={setPicked} />
            )}
          </div>
          {!compact && <section className="as-pane" aria-label="File">{file && <FileDetail file={file} inv={inv} statuses={statuses} onPick={setPicked} />}</section>}
          {compact && (
            <Sheet open={picked !== null && file !== undefined} label="File" width="wide" onClose={() => setPicked(null)}>
              <div className="as-sheet-bar">
                <IconButton size="sm" variant="ghost" label="Close file" onClick={() => setPicked(null)}>
                  <Icon name="x" />
                </IconButton>
              </div>
              <div className="as-sheet-body">{file && <FileDetail file={file} inv={inv} statuses={statuses} onPick={setPicked} />}</div>
            </Sheet>
          )}
        </>
      )}
    </ListPage>
  );
}

export function AgentSetupView({ projects, compact, now }: Omit<PageProps, "state">) {
  return <AgentSetupPage state={useAgentSetup()} projects={projects} compact={compact} now={now} />;
}
