import { useRef, useState, type ReactNode } from "react";
import { BACKGROUND_PRESETS, type DeskBackground } from "../desk/deskBackground.ts";
import { imageFileToDataUrl } from "../desk/deskImage.ts";
import { THEME_SETTINGS, type ThemeSetting } from "./theme.ts";
import type { UpdateControl } from "../update/useUpdate.ts";
import { InstallSettings } from "./InstallSettings.tsx";
import { LinearSettings } from "./LinearSettings.tsx";
import { UpdateSettings } from "./UpdateSettings.tsx";
import { onRadioKeyDown } from "../../ui/radioKeys.ts";
import { Button, Dialog, FileInput, Pressable, Segmented, Tabs } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

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

const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "connections", label: "Connections" },
  { id: "app", label: "App" },
  { id: "updates", label: "Updates" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const LABELS: Record<ThemeSetting, string> = { system: "System", light: "Light", dark: "Dark" };

export function SettingsDialog({ theme, onThemeChange, background, onBackgroundChange, onLinearChange, update, onUpdate, onClose }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { busy, error, setError, run } = useAction();
  const [section, setSection] = useState<SectionId>("appearance");
  const presetId = background.kind === "preset" ? background.id : background.kind === "none" ? "none" : null;

  // onBackgroundChange returns its refusal instead of throwing.
  const upload = (file: File) => run(async () => setError(onBackgroundChange({ kind: "image", dataUrl: await imageFileToDataUrl(file) })));

  const panels: Record<SectionId, ReactNode> = {
    appearance: (
      <>
        <div className="settings-row">
          <span>Theme</span>
          <Segmented label="Theme" value={theme} options={THEME_SETTINGS.map((id) => ({ id, label: LABELS[id] }))} onChange={onThemeChange} />
        </div>
        <div className="settings-row settings-row-top">
          <span>Desk background</span>
          <div className="bg-choices">
            <div className="swatches" role="radiogroup" aria-label="Background" onKeyDown={onRadioKeyDown}>
              {BACKGROUND_PRESETS.map((p) => (
                <Pressable
                  key={p.id}
                  role="radio"
                  aria-checked={presetId === p.id}
                  tabIndex={presetId === p.id || (presetId === null && p.id === BACKGROUND_PRESETS[0]?.id) ? 0 : -1}
                  aria-label={p.label}
                  tooltip={p.label}
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
      </>
    ),
    connections: <LinearSettings onChange={onLinearChange} />,
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
