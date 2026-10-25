import { THEME_SETTINGS, type ThemeSetting } from "../theme.ts";
import { useEscape } from "./useEscape.ts";

interface Props {
  theme: ThemeSetting;
  onThemeChange: (theme: ThemeSetting) => void;
  onClose: () => void;
}

const LABELS: Record<ThemeSetting, string> = { system: "System", light: "Light", dark: "Dark" };

export function SettingsDialog({ theme, onThemeChange, onClose }: Props) {
  useEscape(onClose);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <section className="settings-section" aria-labelledby="settings-appearance">
          <h3 id="settings-appearance">Appearance</h3>
          <div className="settings-row">
            <span>Theme</span>
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {THEME_SETTINGS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={theme === id} className={theme === id ? "active" : ""} onClick={() => onThemeChange(id)}>
                  {LABELS[id]}
                </button>
              ))}
            </div>
          </div>
        </section>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
