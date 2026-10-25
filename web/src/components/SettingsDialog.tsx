import { useRef, useState } from "react";
import { BACKGROUND_PRESETS, type DeskBackground } from "../deskBackground.ts";
import { imageFileToDataUrl } from "../deskImage.ts";
import { THEME_SETTINGS, type ThemeSetting } from "../theme.ts";
import { LinearSettings } from "./LinearSettings.tsx";
import { useEscape } from "./useEscape.ts";

interface Props {
  theme: ThemeSetting;
  onThemeChange: (theme: ThemeSetting) => void;
  background: DeskBackground;
  onBackgroundChange: (background: DeskBackground) => string | null;
  onLinearChange: () => void;
  onClose: () => void;
}

const LABELS: Record<ThemeSetting, string> = { system: "System", light: "Light", dark: "Dark" };

export function SettingsDialog({ theme, onThemeChange, background, onBackgroundChange, onLinearChange, onClose }: Props) {
  useEscape(onClose);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const presetId = background.kind === "preset" ? background.id : background.kind === "none" ? "none" : null;

  async function upload(file: File) {
    setBusy(true);
    try {
      setError(onBackgroundChange({ kind: "image", dataUrl: await imageFileToDataUrl(file) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        <section className="settings-section" aria-labelledby="settings-desk">
          <h3 id="settings-desk">Desk</h3>
          <div className="settings-row settings-row-top">
            <span>Background</span>
            <div className="bg-choices">
              <div className="swatches" role="radiogroup" aria-label="Background">
                {BACKGROUND_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={presetId === p.id}
                    aria-label={p.label}
                    title={p.label}
                    className={`swatch desk-bg-${p.id}${presetId === p.id ? " active" : ""}`}
                    onClick={() => setError(onBackgroundChange(p.id === "none" ? { kind: "none" } : { kind: "preset", id: p.id }))}
                  />
                ))}
                {background.kind === "image" && (
                  <span className="swatch active" role="img" aria-label="Uploaded image" style={{ backgroundImage: `url("${background.dataUrl}")` }} />
                )}
              </div>
              <div className="buttons">
                <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
                  {busy ? "Loading…" : "Upload image…"}
                </button>
                {background.kind === "image" && (
                  <button type="button" onClick={() => setError(onBackgroundChange({ kind: "none" }))}>
                    Remove image
                  </button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(file);
                  }}
                />
              </div>
              {error && <span className="error">{error}</span>}
            </div>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="settings-linear">
          <h3 id="settings-linear">Linear</h3>
          <LinearSettings onChange={onLinearChange} />
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
