import { ctrlLabel } from "../../lib/shortcuts.ts";
import { TABS, type Tab } from "../../lib/tabs.ts";
import type { NavBadges } from "../../lib/navBadges.ts";
import { Icon, IconButton, Kbd, Logo, Pressable, type IconName } from "../../ui/index.ts";

export interface NavUpdate {
  label: string;
  busy: boolean;
}

interface Props {
  /** The sidebar on a wide screen, the bottom bar on a phone: only one is in the page. */
  layout: "side" | "bottom";
  tab: Tab;
  badges: NavBadges;
  badgeText: (n: number) => string;
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

function Badges({ id, badges, badgeText }: { id: Tab; badges: NavBadges; badgeText: Props["badgeText"] }) {
  if (id === "home" && badges.homeUnread > 0) {
    return <span className="nav-badge ok" role="img" aria-label={`${badges.homeUnread} unread`}>{badgeText(badges.homeUnread)}</span>;
  }
  if (id !== "sessions") return null;
  return (
    <>
      {badges.sessionsWaiting && <span className="nav-alert" role="img" aria-label={WAITING} />}
      {badges.sessionsRunning > 0 && <span className="nav-badge work" role="img" aria-label={`${badges.sessionsRunning} running`}>{badgeText(badges.sessionsRunning)}</span>}
    </>
  );
}

function Sidebar({ tab, badges, badgeText, live, update, collapsed, onToggleCollapsed, onTab, onSearch, onSettings, onUpdate }: Omit<Props, "layout">) {
  // Collapsed rows hold only an icon: the tooltip gives the name back.
  const hint = (text: string) => (collapsed ? text : undefined);
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
            <Badges id={id} badges={badges} badgeText={badgeText} />
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
          <IconButton variant="ghost" className="sidebar-collapse" label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} tooltip={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} shortcut={ctrlLabel("B")} onClick={onToggleCollapsed}>
            <Icon name="panelLeft" />
          </IconButton>
        </div>
      </div>
    </nav>
  );
}

function BottomBar({ tab, badges, badgeText, onTab, onSettings }: Pick<Props, "tab" | "badges" | "badgeText" | "onTab" | "onSettings">) {
  const item = (icon: IconName, label: string, props: { id?: Tab; onClick: () => void }) => (
    <Pressable key={label} data-tab={props.id} className={`bottom-item${props.id && tab === props.id ? " active" : ""}`} aria-current={props.id && tab === props.id ? "page" : undefined} onClick={props.onClick}>
      <span className="bottom-icon">
        <Icon name={icon} className="bottom-glyph" />
        {props.id && <Badges id={props.id} badges={badges} badgeText={badgeText} />}
      </span>
      <span className="bottom-label">{label}</span>
    </Pressable>
  );
  return (
    <nav className="bottom-nav" aria-label="Pages">
      {TABS.map(({ id, label, icon }) => item(icon, label, { id, onClick: () => onTab(id) }))}
      {item("settings", "Settings", { onClick: onSettings })}
    </nav>
  );
}

export function AppNav({ layout, ...props }: Props) {
  return layout === "side" ? <Sidebar {...props} /> : <BottomBar {...props} />;
}
