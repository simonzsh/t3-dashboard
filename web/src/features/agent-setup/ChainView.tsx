import { useState } from "react";
import { resolveChain } from "../../../../shared/agentSetup.ts";
import type { AgentSetupInventory, AgentTool, McpServerStatus } from "../../../../shared/api.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Badge, Pressable, Segmented } from "../../ui/index.ts";
import { HookRows, PluginRows } from "./HookRows.tsx";
import { IssueList } from "./IssueList.tsx";
import { McpRows } from "./McpRows.tsx";
import { chainRows } from "./setupTree.ts";

const TOOLS = [
  { id: "claude", label: "Claude", icon: <ProviderIcon provider="claude" /> },
  { id: "codex", label: "Codex", icon: <ProviderIcon provider="codex" /> },
] as const;

interface Props {
  inv: AgentSetupInventory;
  projectId: string;
  statuses: Map<string, McpServerStatus>;
  picked: string | null;
  onPick: (fileId: string) => void;
}

/** What one tool loads for one project, in load order, then the servers, hooks and plugins that result. */
export function ChainView({ inv, projectId, statuses, picked, onPick }: Props) {
  const [tool, setTool] = useState<AgentTool>("claude");
  const rows = chainRows(inv, projectId, tool);
  const chain = resolveChain(inv, projectId, tool);
  return (
    <div className="as-chain">
      <Segmented label="Tool" value={tool} options={TOOLS} onChange={setTool} />
      {rows.length === 0 ? (
        <p className="as-note">No file is loaded for this tool.</p>
      ) : (
        <ol className="as-rows as-order">
          {rows.map((r) => (
            <li key={`${r.order}-${r.fileId}`}>
              <Pressable className={`as-row as-step${r.fileId === picked ? " active" : ""}${r.active ? "" : " inactive"}`} aria-current={r.fileId === picked ? "true" : undefined} onClick={() => onPick(r.fileId)}>
                <span className="as-order-n">{r.order}</span>
                <span className="as-row-main">
                  <span className="as-row-name">{r.path}</span>
                  <span className="as-muted">{r.active ? r.layer : `${r.layer} · skipped${r.note ? `: ${r.note}` : ""}`}</span>
                  {r.active && r.note && <span className="as-muted">{r.note}</span>}
                </span>
                <span className="as-row-badges">
                  <Badge>{r.scope}</Badge>
                  {r.issues > 0 && <Badge>{r.issues === 1 ? "1 issue" : `${r.issues} issues`}</Badge>}
                </span>
              </Pressable>
            </li>
          ))}
        </ol>
      )}
      <IssueList issues={chain?.issues ?? []} home={inv.home} />
      {chain && chain.mcpServers.length + chain.shadowedMcpServers.length > 0 && (
        <section className="as-section">
          <h4>MCP servers</h4>
          <McpRows servers={chain.mcpServers} statuses={statuses} />
          <McpRows servers={chain.shadowedMcpServers} statuses={statuses} shadowed />
        </section>
      )}
      {chain && chain.hooks.length > 0 && (
        <section className="as-section">
          <h4>Hooks</h4>
          <HookRows hooks={chain.hooks} />
        </section>
      )}
      {chain && chain.plugins.length > 0 && (
        <section className="as-section">
          <h4>Plugins</h4>
          <PluginRows plugins={chain.plugins} />
        </section>
      )}
    </div>
  );
}
