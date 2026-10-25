import { useRef, useState } from "react";
import { BACKGROUND_PRESETS, type DeskBackground } from "../deskBackground.ts";
import { imageFileToDataUrl } from "../deskImage.ts";
import { THEME_SETTINGS, type ThemeSetting } from "../theme.ts";
import type { UpdateControl } from "../useUpdate.ts";
import { AboutSettings } from "./AboutSettings.tsx";
import { LinearSettings } from "./LinearSettings.tsx";
import { onRadioKeyDown } from "../ui/radioKeys.ts";
import { Button, Dialog, FileInput, Pressable, Segmented } from "../ui/index.ts";

interface Props {
  theme: ThemeSetting;
  onThemeChange: (theme: ThemeSetting) => void;
  background: DeskBackground;
  onBackgroundChange: (background: DeskBackground) => string | null;
  onLinearChange: () => void;
  update: UpdateControl;
  onUpdate: () => void;
  onClose: () => void;
}

const LABELS: Record<ThemeSetting, string> = { system: "System", light: "Light", dark: "Dark" };

export function SettingsDialog({ theme, onThemeChange, background, onBackgroundChange, onLinearChange, update, onUpdate, onClose }: Props) {
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
    <Dialog title="Settings" className="settings" onClose={onClose}>
      <section className="settings-section" aria-labelledby="settings-appearance">
        <h3 id="settings-appearance">Appearance</h3>
        <div className="settings-row">
          <span>Theme</span>
          <Segmented label="Theme" value={theme} options={THEME_SETTINGS.map((id) => ({ id, label: LABELS[id] }))} onChange={onThemeChange} />
        </div>
      </section>
      <section className="settings-section" aria-labelledby="settings-desk">
        <h3 id="settings-desk">Desk</h3>
        <div className="settings-row settings-row-top">
          <span>Background</span>
          <div className="bg-choices">
            <div className="swatches" role="radiogroup" aria-label="Background" onKeyDown={onRadioKeyDown}>
              {BACKGROUND_PRESETS.map((p) => (
                <Pressable
                  key={p.id}
                  role="radio"
                  aria-checked={presetId === p.id}
                  tabIndex={presetId === p.id || (presetId === null && p.id === BACKGROUND_PRESETS[0]?.id) ? 0 : -1}
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
              <Button loading={busy && "Loading…"} onClick={() => fileInput.current?.click()}>
                Upload image…
              </Button>
              {background.kind === "image" && <Button onClick={() => setError(onBackgroundChange({ kind: "none" }))}>Remove image</Button>}
              <FileInput
                ref={fileInput}
                accept="image/*"
                onFiles={([file]) => {
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
      <section className="settings-section" aria-labelledby="settings-about">
        <h3 id="settings-about">About</h3>
        <AboutSettings update={update} onUpdate={onUpdate} />
      </section>
    </Dialog>
  );
}
