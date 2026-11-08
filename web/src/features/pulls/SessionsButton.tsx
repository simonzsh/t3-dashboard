import type { DashboardThread } from "../../../../shared/api.ts";
import { ActionMenu, Button, type ButtonVariant, Icon } from "../../ui/index.ts";

interface Props {
  /** The sessions tied to one pull request; a pull request can belong to several. */
  sessions: DashboardThread[];
  text: string;
  variant?: ButtonVariant;
  className?: string;
  /** Opens a thread in Sessions; `addOnly` adds it next to the open ones. */
  onOpenThread: (id: string, addOnly: boolean) => void;
}

/** One session: a button that opens it. Several: a menu with their count, one item per session. */
export function SessionsButton({ sessions, text, variant = "ghost", className, onOpenThread }: Props) {
  const [first] = sessions;
  if (!first) return null;
  if (sessions.length === 1) {
    return (
      <Button size="sm" variant={variant} className={className} onClick={(e) => onOpenThread(first.id, e.shiftKey)}>
        <Icon name="messagesSquare" /> {text}
      </Button>
    );
  }
  const items = sessions.map((thread) => ({ label: thread.title, icon: "messagesSquare" as const, onSelect: () => onOpenThread(thread.id, false) }));
  return <ActionMenu className={className} label={`${sessions.length} sessions`} icon="messagesSquare" text={`Sessions ${sessions.length}`} items={items} />;
}
