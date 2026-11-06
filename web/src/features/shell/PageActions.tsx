import type { Tab } from "../../lib/tabs.ts";
import type { SessionLayout } from "../../lib/sessionLayout.ts";
import { ctrlLabel } from "../../lib/shortcuts.ts";
import { Button, Icon, IconButton } from "../../ui/index.ts";

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

/** The header buttons of a page: Sessions picks its layout and starts a session, Automations a task, Home edits its layout. */
export function PageActions({ tab, compact, ready, editingLayout, layoutIsDefault, layout, onLayoutChange, showLayoutToggle, onNewSession, onNewAutomation, onSearch, onEditLayout, onDoneLayout, onResetLayout }: Props) {
  let main = null;
  if (tab === "home" && editingLayout) {
    main = compact ? (
      <>
        <IconButton variant="ghost" label="Reset layout" disabled={layoutIsDefault} onClick={onResetLayout}>
          <Icon name="undo" />
        </IconButton>
        <IconButton variant="primary" className="header-new" label="Done" onClick={onDoneLayout}>
          <Icon name="check" />
        </IconButton>
      </>
    ) : (
      <>
        <Button disabled={layoutIsDefault} onClick={onResetLayout}>
          Reset
        </Button>
        <Button variant="primary" onClick={onDoneLayout}>
          Done
        </Button>
      </>
    );
  } else if (tab === "home") {
    main = compact ? (
      <IconButton variant="primary" className="header-new" label="Edit layout" onClick={onEditLayout}>
        <Icon name="layoutPanels" />
      </IconButton>
    ) : (
      <Button onClick={onEditLayout}>
        <Icon name="layoutPanels" /> Edit layout
      </Button>
    );
  } else if (tab === "desk" && ready) {
    main = (
      <>
        {showLayoutToggle && (
          <div className="layout-toggle" role="group" aria-label="Layout">
            <IconButton variant="ghost" label="Column view" tooltip="Column view" aria-pressed={layout === "columns"} onClick={() => onLayoutChange("columns")}>
              <Icon name="columns" />
            </IconButton>
            <IconButton variant="ghost" label="Grid view" tooltip="Grid view" aria-pressed={layout === "grid"} onClick={() => onLayoutChange("grid")}>
              <Icon name="layoutGrid" />
            </IconButton>
          </div>
        )}
        {compact ? (
          <IconButton variant="primary" className="header-new" label="New Session" onClick={onNewSession}>
            <Icon name="messageSquarePlus" />
          </IconButton>
        ) : (
          <Button variant="primary" kbd={ctrlLabel("N")} onClick={onNewSession}>
            <Icon name="messageSquarePlus" /> New Session
          </Button>
        )}
      </>
    );
  } else if (tab === "automations" && ready) {
    main = compact ? (
      <IconButton variant="primary" className="header-new" label="New Automation" onClick={onNewAutomation}>
        <Icon name="calendarClock" />
      </IconButton>
    ) : (
      <Button variant="primary" kbd={ctrlLabel("⇧N")} onClick={onNewAutomation}>
        New Automation
      </Button>
    );
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
