import type { Tab } from "../../lib/tabs.ts";
import type { SessionLayout } from "../../lib/sessionLayout.ts";
import { ctrlLabel } from "../../lib/shortcuts.ts";
import { Button, Icon, IconButton, type ButtonVariant, type IconName } from "../../ui/index.ts";

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
  showLayoutToggle: boolean;
  onNewSession: () => void;
  onNewAutomation: () => void;
  onSearch: () => void;
  onEditLayout: () => void;
  onDoneLayout: () => void;
  onResetLayout: () => void;
}

interface ActionProps {
  compact: boolean;
  label: string;
  icon: IconName;
  /** Variant on a wide screen. On a phone an action is primary when it is here, or when `primaryOnPhone` says so; the others are ghost. */
  variant?: ButtonVariant;
  primaryOnPhone?: boolean;
  /** Show the icon before the label on a wide screen. */
  withIcon?: boolean;
  kbd?: string;
  disabled?: boolean;
  onClick: () => void;
}

// An icon button on a phone, a text button on a wide screen.
function Action({ compact, label, icon, variant = "secondary", primaryOnPhone = false, withIcon = false, kbd, disabled, onClick }: ActionProps) {
  if (compact) {
    const primary = variant === "primary" || primaryOnPhone;
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

/** The header buttons of a page: Sessions picks its layout and starts a session, Automations a task, Dashboard edits its layout. */
export function PageActions({ tab, compact, ready, editingLayout, layoutIsDefault, layout, onLayoutChange, showLayoutToggle, onNewSession, onNewAutomation, onSearch, onEditLayout, onDoneLayout, onResetLayout }: Props) {
  let main = null;
  if (tab === "dashboard" && editingLayout) {
    main = (
      <>
        <Action compact={compact} label="Reset" icon="undo" disabled={layoutIsDefault} onClick={onResetLayout} />
        <Action compact={compact} label="Done" icon="check" variant="primary" onClick={onDoneLayout} />
      </>
    );
  } else if (tab === "dashboard") {
    main = <Action compact={compact} label="Edit layout" icon="layoutPanels" primaryOnPhone withIcon onClick={onEditLayout} />;
  } else if (tab === "sessions" && ready) {
    // One button: its icon and label name the view it switches to.
    const toLayout = layout === "columns" ? "grid" : "columns";
    const toggle = layout === "columns" ? "Switch to grid view" : "Switch to column view";
    main = (
      <>
        {showLayoutToggle && (
          <IconButton variant="ghost" className="layout-toggle" label={toggle} tooltip={toggle} onClick={() => onLayoutChange(toLayout)}>
            <Icon name={layout === "columns" ? "layoutGrid" : "columns"} />
          </IconButton>
        )}
        <Action compact={compact} label="New Session" icon="messageSquarePlus" variant="primary" withIcon kbd={ctrlLabel("N")} onClick={onNewSession} />
      </>
    );
  } else if (tab === "automations" && ready) {
    main = <Action compact={compact} label="New Automation" icon="calendarClock" variant="primary" kbd={ctrlLabel("⇧N")} onClick={onNewAutomation} />;
  }
  return (
    <>
      {main}
      {compact && ready && (
        <IconButton variant="ghost" label="Search" onClick={onSearch}>
          <Icon name="search" />
        </IconButton>
      )}
    </>
  );
}
