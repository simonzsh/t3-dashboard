import { ctrlLabel } from "../../lib/shortcuts.ts";
import { TABS, type Tab } from "../../lib/tabs.ts";
import { Icon, IconButton, Kbd, Logo, Pressable } from "../../ui/index.ts";

interface NavUpdate {
  label: string;
  busy: boolean;
}

interface Props {
  /** The sidebar on a wide screen, the bottom bar on a phone: only one is in the page. */
  layout: "side" | "bottom";
  tab: Tab;
  /** Dashboard items that wait for you and were not read yet. */
  unread: number;
  /** Sessions entry: running and unread rows of the sessions list, and whether an agent waits for you. */
  sessions: { count: number; waiting: boolean };
  /** Automations entry: tasks whose latest finished run is unread, and whether one of those runs failed. */
  automations: { count: number; failed: boolean };
  live: boolean;
  update: NavUpdate | null;
  /** Sidebar only: App owns it so Ctrl+B can toggle it. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTab: (tab: Tab) => void;
  onSearch: () => void;
  onSettings: () => void;
  onUpdate: () => void;
}

const WAITING = "An agent is waiting for your reply";

export const badgeText = (n: number): string => (n > 9 ? "9+" : String(n));

function Badges({ id, unread, sessions, automations }: Pick<Props, "unread" | "sessions" | "automations"> & { id: Tab }) {
  if (id === "dashboard" && unread > 0) {
    return <span className="nav-badge" role="img" aria-label={`${unread} unread`}>{badgeText(unread)}</span>;
  }
  if (id === "automations") {
    return (
      <>
        {automations.failed && (
          <span className="nav-alert err" role="img" aria-label="An automation run failed">
            <Icon name="alert" />
          </span>
        )}
        {automations.count > 0 && <span className="nav-badge" role="img" aria-label={`${automations.count} unread runs`}>{badgeText(automations.count)}</span>}
      </>
    );
  }
  if (id !== "sessions") return null;
  return (
    <>
      {sessions.waiting && (
        <span className="nav-alert" role="img" aria-label={WAITING}>
          <Icon name="user" />
        </span>
      )}
      {sessions.count > 0 && <span className="nav-badge" role="img" aria-label={`${sessions.count} running or unread`}>{badgeText(sessions.count)}</span>}
    </>
  );
}

function Sidebar({ tab, unread, sessions, automations, live, update, collapsed, onToggleCollapsed, onTab, onSearch, onSettings, onUpdate }: Omit<Props, "layout">) {
  // Collapsed rows hold only an icon: the tooltip gives the name back.
  const hint = (text: string) => (collapsed ? text : undefined);
  const collapse = collapsed ? "Expand the sidebar" : "Collapse the sidebar";
  return (
    <nav className={`sidebar${collapsed ? " collapsed" : ""}`} aria-label="Pages">
      <div className="sidebar-brand">
        <Logo />
        <span className="sidebar-name">T3 Dashboard</span>
      </div>
      <Pressable className="sidebar-search" tooltip={hint("Search")} onClick={onSearch} aria-label="Search">
        <Icon name="search" className="nav-icon" />
        <span className="nav-label">Search…</span>
        <Kbd>⌘K</Kbd>
      </Pressable>
      <div className="sidebar-items">
        {TABS.map(({ id, label, icon }) => (
          <Pressable key={id} data-tab={id} className={`nav-row${tab === id ? " active" : ""}`} aria-current={tab === id ? "page" : undefined} tooltip={hint(label)} onClick={() => onTab(id)}>
            <Icon name={icon} className="nav-icon" />
            <span className="nav-label">{label}</span>
            <Badges id={id} unread={unread} sessions={sessions} automations={automations} />
          </Pressable>
        ))}
      </div>
      <div className="sidebar-foot">
        {update && (
          <Pressable className="update-pill" disabled={update.busy} tooltip={update.label} onClick={onUpdate}>
            <Icon name="arrowUp" className="nav-icon" strokeWidth={1.8} />
            <span className="nav-label">{update.busy ? "Updating…" : update.label}</span>
          </Pressable>
        )}
        <div className="sidebar-actions">
          <span className={`conn ${live ? "up" : "down"}`} data-tooltip={live ? "Connected to T3 Code" : "Connection lost"}>
            <span className="conn-dot" />
            <span className="nav-label">{live ? "Connected" : "Offline"}</span>
          </span>
          <IconButton variant="ghost" label="Settings" tooltip="Settings" shortcut={ctrlLabel(",")} onClick={onSettings}>
            <Icon name="settings" strokeWidth={1.8} />
          </IconButton>
          <IconButton variant="ghost" className="sidebar-collapse" label={collapse} tooltip={collapse} shortcut={ctrlLabel("B")} onClick={onToggleCollapsed}>
            <Icon name="panelLeft" />
          </IconButton>
        </div>
      </div>
    </nav>
  );
}

function BottomBar({ tab, unread, sessions, automations, onTab }: Pick<Props, "tab" | "unread" | "sessions" | "automations" | "onTab">) {
  return (
    <nav className="bottom-nav" aria-label="Pages">
      {TABS.map(({ id, label, icon }) => (
        <Pressable key={id} data-tab={id} className={`bottom-item${tab === id ? " active" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => onTab(id)}>
          <span className="bottom-icon">
            <Icon name={icon} className="bottom-glyph" />
            <Badges id={id} unread={unread} sessions={sessions} automations={automations} />
          </span>
          <span>{label}</span>
        </Pressable>
      ))}
    </nav>
  );
}

export function AppNav({ layout, ...props }: Props) {
  return layout === "side" ? <Sidebar {...props} /> : <BottomBar {...props} />;
}
