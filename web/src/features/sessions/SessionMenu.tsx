import { useState } from "react";
import { RenameSessionDialog } from "./RenameSessionDialog.tsx";
import type { DashboardThread } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useAction } from "../../lib/useAction.ts";
import { t3CodeLink } from "../../lib/t3Link.ts";
import { ActionMenu, type ActionMenuItem } from "../../ui/index.ts";
import type { AlertMode } from "./sessions.ts";

export interface SessionMenuContext {
  t3EnvironmentId: string | null;
  alert: AlertMode | null;
  onToggleAlert: (id: string) => void;
}

export function sessionMenuItems(thread: DashboardThread, context: SessionMenuContext, regenerate: () => void, busy: boolean, rename: () => void): ActionMenuItem[] {
  const href = t3CodeLink(context.t3EnvironmentId, thread.id);
  return [
    { label: "Rename", icon: "pencil", onSelect: rename },
    { label: busy ? "Generating title…" : "Regenerate title", icon: "refresh", iconClassName: busy ? "spinning" : undefined, disabled: busy, onSelect: regenerate },
    ...(context.alert ? [{
      label: context.alert === "armed" ? "Turn off phone alert" : "Alert me on my phone",
      icon: context.alert === "armed" ? "bellRing" as const : "bell" as const,
      onSelect: () => context.onToggleAlert(thread.id),
    }] : []),
    { label: "Open in T3 Code", icon: "t3", disabled: !href, onSelect: () => { if (href) window.location.href = href; } },
  ];
}

export function SessionMenu({ thread, ...context }: SessionMenuContext & { thread: DashboardThread }) {
  const [renaming, setRenaming] = useState(false);
  const api = useApi();
  const action = useAction("regenerate the title");
  return <><ActionMenu label={`Actions for ${thread.title}`} items={sessionMenuItems(thread, context, () => { void action.run(() => api.regenerateTitle(thread.id)); }, action.busy, () => setRenaming(true))} />
    {renaming && <RenameSessionDialog id={thread.id} title={thread.title} onClose={() => setRenaming(false)} />}
  </>;
}
