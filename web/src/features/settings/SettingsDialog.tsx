import { GitHubSettings } from "./GitHubSettings.tsx";
import { useState, type ReactNode } from "react";
import { THEME_SETTINGS, type ThemeSetting } from "./theme.ts";
import { ACCENTS, type Accent } from "./accent.ts";
import type { UpdateControl } from "../update/useUpdate.ts";
import { AlertsSettings } from "./AlertsSettings.tsx";
import { InstallSettings } from "./InstallSettings.tsx";
import { LinearSettings } from "./LinearSettings.tsx";
import { UpdateSettings } from "./UpdateSettings.tsx";
import { Dialog, Icon, onRadioKeyDown, Pressable, rovingTabIndex, Segmented, Switch, Tabs, type IconName } from "../../ui/index.ts";

interface Props {
  theme: ThemeSetting;
  onThemeChange: (theme: ThemeSetting) => void;
  accent: Accent;
  onAccentChange: (accent: Accent) => void;
  tint: boolean;
  onTintChange: (on: boolean) => void;
  showRobot: boolean;
  onShowRobotChange: (on: boolean) => void;
  onLinearChange: () => void;
  update: UpdateControl;
  onUpdate: () => void;
  onClose: () => void;
}

const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "connections", label: "Connections" },
  { id: "app", label: "App" },
  { id: "updates", label: "Updates" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const LABELS: Record<ThemeSetting, string> = { system: "System", light: "Light", dark: "Dark" };
// "Tinted" mixes the accent color into the background, cards and lines.
const SURFACES = [
  { id: "neutral", label: "Neutral", icon: <Icon name="circle" /> },
  { id: "tinted", label: "Tinted", icon: <Icon name="droplet" /> },
] as const;
const THEME_ICONS: Record<ThemeSetting, IconName> = { system: "monitor", light: "sun", dark: "moon" };

export function SettingsDialog({ theme, onThemeChange, accent, onAccentChange, tint, onTintChange, showRobot, onShowRobotChange, onLinearChange, update, onUpdate, onClose }: Props) {
  const [section, setSection] = useState<SectionId>("appearance");

  const panels: Record<SectionId, ReactNode> = {
    appearance: (
      <>
        <div className="settings-row">
          <span>Theme</span>
          <Segmented label="Theme" value={theme} options={THEME_SETTINGS.map((id) => ({ id, label: LABELS[id], icon: <Icon name={THEME_ICONS[id]} /> }))} onChange={onThemeChange} />
        </div>
        <div className="settings-row">
          <span>Interface</span>
          <Segmented label="Interface" value={tint ? "tinted" : "neutral"} options={SURFACES} onChange={(id) => onTintChange(id === "tinted")} />
        </div>
        <div className="settings-row">
          <span>Accent color</span>
          <div className="swatches" role="radiogroup" aria-label="Accent color" onKeyDown={onRadioKeyDown}>
            {ACCENTS.map((a, i) => (
              <Pressable
                key={a.id}
                role="radio"
                aria-checked={accent === a.id}
                tabIndex={rovingTabIndex(accent === a.id, i === 0, ACCENTS.some((x) => x.id === accent))}
                aria-label={a.label}
                tooltip={a.label}
                className={`swatch${accent === a.id ? " active" : ""}`}
                style={{ background: `linear-gradient(135deg, ${a.light} 50%, ${a.dark} 50%)` }}
                onClick={() => onAccentChange(a.id)}
              />
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span>Show robot</span>
          <Switch label="Show robot" checked={showRobot} onChange={onShowRobotChange} />
        </div>
      </>
    ),
    connections: (
      <>
        <LinearSettings onChange={onLinearChange} />
        <GitHubSettings />
        <AlertsSettings />
      </>
    ),
    app: <InstallSettings />,
    updates: <UpdateSettings update={update} onUpdate={onUpdate} />,
  };

  return (
    <Dialog title="Settings" className="settings" onClose={onClose}>
      <div className="settings-layout">
        <Tabs label="Settings sections" idPrefix="settings-tab" className="settings-tabs" value={section} options={SECTIONS} onChange={setSection} />
        <div className="settings-panel" role="tabpanel" id="settings-tab-panel" tabIndex={0} aria-labelledby={`settings-tab-${section}`}>
          {panels[section]}
        </div>
      </div>
    </Dialog>
  );
}
