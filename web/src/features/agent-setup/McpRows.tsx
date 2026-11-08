import type { McpServer, McpServerStatus, McpStatus } from "../../../../shared/api.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Badge, type BadgeVariant } from "../../ui/index.ts";
import { ValueText } from "./DataView.tsx";
import { IssueList } from "./IssueList.tsx";

const STATUS: Record<McpStatus, { label: string; variant: BadgeVariant }> = {
  reachable: { label: "Reachable", variant: "done" },
  "needs-auth": { label: "Needs auth", variant: "waiting" },
  failing: { label: "Failing", variant: "error" },
  configured: { label: "Configured", variant: "neutral" },
  disabled: { label: "Disabled", variant: "neutral" },
};

const target = (s: McpServer): string => s.url ?? [s.command, ...s.args].filter(Boolean).join(" ");

interface Props {
  servers: McpServer[];
  /** Status by server id; empty while unknown or when the status route fails. */
  statuses: Map<string, McpServerStatus>;
  /** The servers hidden by a same-name server of a closer scope. */
  shadowed?: boolean;
}

export function McpRows({ servers, statuses, shadowed = false }: Props) {
  return (
    <ul className="as-rows">
      {servers.map((s) => {
        const known = statuses.get(s.id);
        const status = known ? STATUS[known.status] : s.enabled ? null : STATUS.disabled;
        return (
          <li key={s.id} className={`as-row as-server${shadowed ? " shadowed" : ""}`}>
            <ProviderIcon provider={s.tool} />
            <span className="as-row-main">
              <span className="as-row-name">{s.name}</span>
              <span className="as-target">{target(s)}</span>
              {[...s.env.map((kv) => ["env", kv] as const), ...s.headers.map((kv) => ["header", kv] as const)].map(([kind, kv]) => (
                <span key={`${s.id}:${kind}:${kv.key}`} className="as-kv">
                  <span className="as-key">{kv.key}</span>
                  <ValueText text={kv.value} />
                </span>
              ))}
              <IssueList issues={s.issues} />
            </span>
            <span className="as-row-badges">
              <Badge>{s.scope}</Badge>
              <Badge>{s.transport}</Badge>
              {shadowed && <Badge>Shadowed</Badge>}
              {status && (
                <span data-tooltip={known?.detail ?? undefined}>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
