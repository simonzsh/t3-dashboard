import type { DashboardProject, McpOverview, McpServerStatus, McpStatus, SetupScope } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Badge, ButtonLink, CardHead, Icon, IconButton, type BadgeVariant } from "../../ui/index.ts";
import type { ReadState } from "./pollRead.ts";
import { SkeletonRows } from "./SkeletonRows.tsx";

const SCOPES: { scope: SetupScope; label: string }[] = [
  { scope: "user", label: "User" },
  { scope: "project", label: "Project" },
  { scope: "local", label: "Local" },
  { scope: "managed", label: "Managed" },
];
const BADGES: Record<McpStatus, { variant: BadgeVariant; label: string }> = {
  reachable: { variant: "done", label: "Reachable" },
  "needs-auth": { variant: "waiting", label: "Needs auth" },
  failing: { variant: "error", label: "Failing" },
  configured: { variant: "neutral", label: "Configured" },
  disabled: { variant: "neutral", label: "Disabled" },
};

function Row({ server, projects }: { server: McpServerStatus; projects: Map<string, DashboardProject> }) {
  const badge = BADGES[server.status];
  const tags = server.projectIds.flatMap((id) => projects.get(id) ?? []);
  return (
    <li className="mcp-row">
      <ProviderIcon provider={server.tool} />
      <span className="mcp-name">{server.name}</span>
      {server.scope !== "user" && tags.map((p) => <ProjectTag key={p.id} icon={p.icon} title={p.title} />)}
      <span className="mcp-target" data-tooltip={server.target} data-tooltip-clipped>{server.target}</span>
      <span data-tooltip={server.detail ?? undefined}>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </span>
    </li>
  );
}

function Groups({ overview, projects }: { overview: McpOverview; projects: Map<string, DashboardProject> }) {
  return (
    <>
      {SCOPES.map(({ scope, label }) => {
        const rows = overview.servers.filter((s) => s.scope === scope);
        if (rows.length === 0) return null;
        return (
          <div className="mcp-group" key={scope}>
            <h3 className="mcp-group-head">{label}</h3>
            <ul className="mcp-list">{rows.map((s) => <Row key={s.serverId} server={s} projects={projects} />)}</ul>
          </div>
        );
      })}
    </>
  );
}

export function McpCard({ state, now, projects }: { state: ReadState<McpOverview>; now: Date; projects: DashboardProject[] }) {
  const { value: overview, error, loading, refresh } = state;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const count = overview?.servers.length ?? 0;
  return (
    <section className="dashboard-card mcp-card" aria-labelledby="dashboard-mcp-head">
      <CardHead
        id="dashboard-mcp-head"
        icon="plug"
        title="MCP servers"
        note={overview ? `${count} ${count === 1 ? "server" : "servers"}` : undefined}
        actions={
          <>
            {overview && <span className="card-updated">Updated {relativeTime(overview.readAt, now)}</span>}
            <IconButton size="sm" variant="ghost" label="Refresh MCP servers" tooltip="Refresh MCP servers" disabled={loading} aria-busy={loading} onClick={refresh}>
              <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
            </IconButton>
          </>
        }
      />
      {!overview ? (
        error ? <p className="dashboard-note error" role="alert">{error}</p> : <SkeletonRows label="Loading MCP servers" rows={3} />
      ) : (
        <>
          {count === 0 ? <p className="dashboard-note">No MCP servers are configured.</p> : <Groups overview={overview} projects={byId} />}
          {error && <p className="dashboard-note error" role="alert">Could not refresh MCP servers. {error}</p>}
          <div className="mcp-foot">
            <ButtonLink href="#/setup" size="sm" variant="ghost">Open Setup</ButtonLink>
          </div>
        </>
      )}
    </section>
  );
}
