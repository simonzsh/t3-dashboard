import type { Tab } from "../../lib/tabs.ts";
import type { SessionLayout } from "../../lib/sessionLayout.ts";
import { ctrlLabel } from "../../lib/shortcuts.ts";
import { Button, CountBadge, Icon, IconButton, SidePanelToggle, type ButtonVariant, type IconName } from "../../ui/index.ts";

interface Props {
  tab: Tab;
  /** The phone layout: icon buttons, and a search button. */
  compact: boolean;
  /** False until the dashboard state exists: nothing can be created yet. */
  ready: boolean;
  editingLayout: boolean;
  layoutIsDefault: boolean;
  /** The Sessions layout toggle: shown only on a wide screen. */
  layout: SessionLayout;
  onLayoutChange: (layout: SessionLayout) => void;
  /** The Sessions list toggle: wide screen only. */
  listHidden: boolean;
  onToggleList: () => void;
  onNewSession: () => void;
  onNewAutomation: () => void;
  /** News: Run now needs a saved task, and waits while a run starts. */
  newsCanRun: boolean;
  newsRunning: boolean;
  onNewsRun: () => void;
  onNewsSettings: () => void;
  onSearch: () => void;
  /** Phone only: Settings sits in the header, the bottom bar holds the pages. */
  onSettings: () => void;
  /** Phone only: the bottom bar has no update button, so Settings shows a dot. */
  updateReady: boolean;
  onEditLayout: () => void;
  onDoneLayout: () => void;
  onResetLayout: () => void;
  /** Unread notifications: the bell badge. */
  unread: number;
  notificationsOpen: boolean;
  onToggleNotifications: () => void;
}

interface ActionProps {
  compact: boolean;
  label: string;
  icon: IconName;
  /** Variant on a wide screen. On a phone a primary action stays primary; the others are ghost icons. */
  variant?: ButtonVariant;
  /** Show the icon before the label on a wide screen. */
  withIcon?: boolean;
  kbd?: string;
  disabled?: boolean;
  onClick: () => void;
}

// An icon button on a phone, a text button on a wide screen.
function Action({ compact, label, icon, variant = "secondary", withIcon = false, kbd, disabled, onClick }: ActionProps) {
  if (compact) {
    const primary = variant === "primary";
    return (
      <IconButton variant={primary ? "primary" : "ghost"} className={primary ? "header-new" : undefined} label={label} disabled={disabled} onClick={onClick}>
        <Icon name={icon} />
      </IconButton>
    );
  }
  return (
    <Button variant={variant} kbd={kbd} disabled={disabled} onClick={onClick}>
      {withIcon ? (
        <>
          <Icon name={icon} /> {label}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

/** The header buttons of a page: Sessions hides the list, picks its layout and starts a session, Automations a task, News edits its settings and runs it, Dashboard shows the Notifications bell and edits its layout. */
export function PageActions({ tab, compact, ready, editingLayout, layoutIsDefault, layout, onLayoutChange, listHidden, onToggleList, onNewSession, onNewAutomation, newsCanRun, newsRunning, onNewsRun, onNewsSettings, onSearch, onSettings, updateReady, onEditLayout, onDoneLayout, onResetLayout, unread, notificationsOpen, onToggleNotifications }: Props) {
  let main = null;
  if (tab === "dashboard" && editingLayout) {
    main = (
      <>
        <Action compact={compact} label="Reset" icon="undo" disabled={layoutIsDefault} onClick={onResetLayout} />
        <Action compact={compact} label="Done" icon="check" variant="primary" onClick={onDoneLayout} />
      </>
    );
  } else if (tab === "dashboard") {
    const bell = notificationsOpen ? "Hide notifications" : "Show notifications";
    main = (
      <>
        <IconButton variant="ghost" className="notif-bell" label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} tooltip={bell} aria-pressed={notificationsOpen} onClick={onToggleNotifications}>
          <Icon name="bell" />
          <CountBadge count={unread} max={9} hidden />
        </IconButton>
        <Action compact={compact} label="Edit layout" icon="layoutPanels" withIcon onClick={onEditLayout} />
      </>
    );
  } else if (tab === "sessions" && ready) {
    // One button: its icon and label name the view it switches to.
    const toLayout = layout === "columns" ? "grid" : "columns";
    const toggle = layout === "columns" ? "Switch to grid view" : "Switch to column view";
    main = (
      <>
        {!compact && <SidePanelToggle hidden={listHidden} show="Show the list" hide="Hide the list" onToggle={onToggleList} />}
        {!compact && (
          <IconButton variant="ghost" className="layout-toggle" label={toggle} tooltip={toggle} onClick={() => onLayoutChange(toLayout)}>
            <Icon name={layout === "columns" ? "layoutGrid" : "columns"} />
          </IconButton>
        )}
        <Action compact={compact} label="New Session" icon="messageSquarePlus" variant="primary" withIcon kbd={ctrlLabel("N")} onClick={onNewSession} />
      </>
    );
  } else if (tab === "automations" && ready) {
    main = <Action compact={compact} label="New Automation" icon="calendarClock" variant="primary" withIcon kbd={ctrlLabel("⇧N")} onClick={onNewAutomation} />;
  } else if (tab === "news" && ready) {
    main = (
      <>
        {compact ? (
          <Action compact label="News settings" icon="slidersHorizontal" onClick={onNewsSettings} />
        ) : (
          // An icon on a wide screen too, with its label as the tooltip.
          <IconButton variant="ghost" label="News settings" tooltip="News settings" onClick={onNewsSettings}>
            <Icon name="slidersHorizontal" />
          </IconButton>
        )}
        <Action compact={compact} label="Run now" icon="play" variant="primary" withIcon disabled={!newsCanRun || newsRunning} onClick={onNewsRun} />
      </>
    );
  }
  return (
    <>
      {main}
      {compact && ready && (
        <>
          <IconButton variant="ghost" label="Search" onClick={onSearch}>
            <Icon name="search" />
          </IconButton>
          <IconButton variant="ghost" label={updateReady ? "Settings, an update is ready" : "Settings"} className={updateReady ? "has-update" : undefined} onClick={onSettings}>
            <Icon name="settings" strokeWidth={1.8} />
          </IconButton>
        </>
      )}
    </>
  );
}
