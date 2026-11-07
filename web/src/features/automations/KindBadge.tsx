import type { Automation } from "../../../../shared/api.ts";
import { Badge, Icon, type IconName } from "../../ui/index.ts";

const KINDS: Record<Automation["kind"], { icon: IconName; label: string }> = {
  routine: { icon: "refresh", label: "Routine" },
  reminder: { icon: "bell", label: "Reminder" },
  webhook: { icon: "bolt", label: "Webhook" },
};

export function KindBadge({ kind }: { kind: Automation["kind"] }) {
  const { icon, label } = KINDS[kind];
  return (
    <Badge className="kind-badge">
      <Icon name={icon} />
      {label}
    </Badge>
  );
}
