import type { HookRow, PluginRow } from "../../../../shared/api.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Badge } from "../../ui/index.ts";

export function HookRows({ hooks }: { hooks: HookRow[] }) {
  return (
    <ul className="as-rows">
      {hooks.map((h) => (
        <li key={h.id} className="as-row">
          <ProviderIcon provider={h.tool} />
          <span className="as-row-main">
            <span className="as-row-name">
              {h.event}
              {h.matcher && <span className="as-muted"> · {h.matcher}</span>}
            </span>
            <span className="as-target">{h.target}</span>
          </span>
          <span className="as-row-badges">
            <Badge>{h.scope}</Badge>
            <Badge>{h.type}</Badge>
            {h.timeoutSec !== null && <Badge>{h.timeoutSec} s</Badge>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PluginRows({ plugins }: { plugins: PluginRow[] }) {
  return (
    <ul className="as-rows">
      {plugins.map((p) => (
        <li key={p.id} className="as-row">
          <ProviderIcon provider="claude" />
          <span className="as-row-main">
            <span className="as-row-name">{p.plugin}</span>
          </span>
          <span className="as-row-badges">
            <Badge>{p.scope}</Badge>
            <Badge variant={p.enabled ? "done" : "neutral"}>{p.enabled ? "Enabled" : "Disabled"}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}
