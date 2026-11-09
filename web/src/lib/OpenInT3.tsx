import { Icon, IconButtonLink } from "../ui/index.ts";
import { t3CodeLink } from "./t3Link.ts";

interface Props {
  environmentId: string | null;
  threadId: string;
}

export function OpenInT3({ environmentId, threadId }: Props) {
  const href = t3CodeLink(environmentId, threadId);
  if (!href) return null;
  return (
    <IconButtonLink variant="ghost" size="sm" href={href} label="Open in T3 Code" tooltip="Open in T3 Code" onClick={(e) => e.stopPropagation()}>
      <Icon name="t3" />
    </IconButtonLink>
  );
}
