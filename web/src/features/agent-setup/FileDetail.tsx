import { useMemo } from "react";
import type { AgentSetupInventory, McpServerStatus, SetupContent, SetupFile } from "../../../../shared/api.ts";
import { formatBytes } from "../../lib/format.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Badge, Icon, Pressable } from "../../ui/index.ts";
import { DataView, ValueText } from "./DataView.tsx";
import { HookRows, PluginRows } from "./HookRows.tsx";
import { IssueList } from "./IssueList.tsx";
import { McpRows } from "./McpRows.tsx";
import { displayPath } from "./setupTree.ts";

const OMITTED = {
  private: "This file holds private data. Only its MCP servers are read.",
  "too-large": "This file is too large to show.",
  budget: "The size budget ran out before this file.",
  unreadable: "The dashboard cannot read this file.",
} as const;

function Content({ content }: { content: SetupContent }) {
  const body = useMemo(() => (content.type === "markdown" ? renderMarkdown(content.text) : null), [content]);
  switch (content.type) {
    case "markdown":
      return (
        <>
          <div className="md as-md">{body}</div>
          {content.truncated && <p className="as-note">The file is longer: only the start is shown.</p>}
        </>
      );
    case "data":
      return <DataView value={content.value} />;
    case "fields":
      return (
        <dl className="as-fields">
          {content.fields.map((f) => (
            <div key={f.key}>
              <dt>{f.key}</dt>
              <dd>
                <ValueText text={f.value} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case "omitted":
      return <p className="as-note">{OMITTED[content.reason]}</p>;
  }
}

interface Props {
  file: SetupFile;
  inv: AgentSetupInventory;
  statuses: Map<string, McpServerStatus>;
  onPick: (fileId: string) => void;
}

/** One file: where it is, its problems, its content, and the servers and hooks it declares. */
export function FileDetail({ file, inv, statuses, onPick }: Props) {
  const servers = inv.mcpServers.filter((s) => s.sourceFileId === file.id);
  const hooks = inv.hooks.filter((h) => h.sourceFileId === file.id);
  const plugins = inv.plugins.filter((p) => p.sourceFileId === file.id);
  return (
    <article className="as-detail" aria-label={displayPath(file.path, inv.home)}>
      <header className="as-detail-head">
        <h3 className="as-detail-path">{displayPath(file.path, inv.home)}</h3>
        <div className="as-row-badges">
          {file.tools.map((t) => (
            <ProviderIcon key={t} provider={t} />
          ))}
          <Badge>{file.scope}</Badge>
          <Badge>{file.kind}</Badge>
          {file.sizeBytes !== null && <Badge>{formatBytes(file.sizeBytes)}</Badge>}
        </div>
        {file.linkTarget && <p className="as-note">Symbolic link to {file.linkTarget}</p>}
      </header>
      <IssueList issues={file.issues} home={inv.home} />
      {file.imports.length > 0 && (
        <section className="as-section">
          <h4>Imports</h4>
          <ul className="as-links">
            {file.imports.map((id) => (
              <li key={id}>
                <Pressable className="as-link" onClick={() => onPick(id)}>
                  <Icon name="fileText" />
                  {displayPath(inv.files[id]?.path ?? id, inv.home)}
                </Pressable>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Content content={file.content} />
      {servers.length > 0 && (
        <section className="as-section">
          <h4>MCP servers</h4>
          <McpRows servers={servers} statuses={statuses} />
        </section>
      )}
      {hooks.length > 0 && (
        <section className="as-section">
          <h4>Hooks</h4>
          <HookRows hooks={hooks} />
        </section>
      )}
      {plugins.length > 0 && (
        <section className="as-section">
          <h4>Plugins</h4>
          <PluginRows plugins={plugins} />
        </section>
      )}
    </article>
  );
}
