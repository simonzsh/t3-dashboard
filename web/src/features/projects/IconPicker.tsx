import { useEffect, useState } from "react";
import type { ProjectIcon as Icon, ProjectIconChoices, ProjectIconSpec } from "../../../../shared/api.ts";
import { PROJECT_COLORS, PROJECT_COLOR_NAMES } from "../../../../shared/projectColors.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { monogramColor } from "../../lib/monogram.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { Pressable, Segmented, TextInput } from "../../ui/index.ts";
import { EMOJI_PRESETS, firstGrapheme, monogramFromInput } from "./projectIcons.ts";

type Tab = "icons" | "emoji" | "monogram" | "default";
const TABS = [
  { id: "icons", label: "Icons" },
  { id: "emoji", label: "Emoji" },
  { id: "monogram", label: "Monogram" },
  { id: "default", label: "Default" },
] as const;

const colorName = (hex: string) => PROJECT_COLOR_NAMES.find((n) => PROJECT_COLORS[n] === hex) ?? "blue";
const hex = (name: string) => PROJECT_COLORS[name] ?? PROJECT_COLORS.blue!;

interface Props {
  title: string;
  /** null: T3's default icon. */
  value: ProjectIconSpec | null;
  onChange: (icon: ProjectIconSpec | null) => void;
}

/** Picks a project icon: a Lucide preset, an emoji or a monogram, with a color, or T3's default. */
export function IconPicker({ title, value, onChange }: Props) {
  const api = useApi();
  const [choices, setChoices] = useState<ProjectIconChoices["icons"]>([]);
  const [tab, setTab] = useState<Tab>(value?.kind === "emoji" ? "emoji" : value?.kind === "monogram" ? "monogram" : "icons");
  const [color, setColor] = useState(value && value.kind !== "emoji" ? value.color : colorName(monogramColor(title)));
  const [text, setText] = useState(value?.kind === "monogram" ? value.text : "");
  const [paste, setPaste] = useState("");

  useEffect(() => {
    let stale = false;
    api.projectIcons().then(
      (r) => !stale && setChoices(r.icons),
      () => {},
    );
    return () => {
      stale = true;
    };
  }, []);

  const pickColor = (name: string) => {
    setColor(name);
    if (value?.kind === "lucide") onChange({ ...value, color: name });
    else if (value?.kind === "monogram") onChange({ ...value, color: name });
  };
  const pickTab = (next: Tab) => {
    setTab(next);
    if (next === "default") onChange(null);
  };
  const shape = (name: string) => choices.find((c) => c.name === name)?.icon;
  const previewIcon = (): Icon | null => {
    if (!value) return null;
    if (value.kind === "emoji") return value;
    if (value.kind === "monogram") return { kind: "monogram", text: value.text, color: hex(value.color) };
    const found = shape(value.name);
    return found?.kind === "lucide" ? { ...found, color: hex(value.color) } : null;
  };

  return (
    <div className="icon-picker">
      <div className="icon-picker-head">
        <span className="icon-picker-preview">
          <ProjectIcon icon={previewIcon()} title={title} />
        </span>
        <Segmented label="Icon type" value={tab} options={TABS} onChange={pickTab} />
      </div>
      {tab === "icons" && (
        <div className="icon-grid" role="group" aria-label="Icons">
          {choices.map(({ name, icon }) => (
            <Pressable key={name} className="icon-choice" aria-label={name} aria-pressed={value?.kind === "lucide" && value.name === name} onClick={() => onChange({ kind: "lucide", name, color })}>
              <ProjectIcon icon={icon.kind === "lucide" ? { ...icon, color: hex(color) } : icon} title={name} />
            </Pressable>
          ))}
        </div>
      )}
      {tab === "emoji" && (
        <>
          <div className="icon-grid" role="group" aria-label="Emoji">
            {EMOJI_PRESETS.map(({ emoji, label }) => (
              <Pressable key={emoji} className="icon-choice" aria-label={label} aria-pressed={value?.kind === "emoji" && value.emoji === emoji} onClick={() => onChange({ kind: "emoji", emoji })}>
                <span aria-hidden="true">{emoji}</span>
              </Pressable>
            ))}
          </div>
          <TextInput
            aria-label="Paste an emoji"
            placeholder="Paste an emoji"
            value={paste}
            onChange={(e) => {
              const emoji = firstGrapheme(e.target.value);
              setPaste(emoji);
              if (emoji) onChange({ kind: "emoji", emoji });
            }}
          />
        </>
      )}
      {tab === "monogram" && (
        <TextInput
          aria-label="Monogram"
          placeholder="One or two letters"
          value={text}
          onChange={(e) => {
            const next = monogramFromInput(e.target.value);
            setText(next);
            if (next) onChange({ kind: "monogram", text: next, color });
          }}
        />
      )}
      {(tab === "icons" || tab === "monogram") && (
        <div className="swatches" role="group" aria-label="Color">
          {PROJECT_COLOR_NAMES.map((name) => (
            <Pressable key={name} className="swatch" aria-label={name} aria-pressed={color === name} style={{ background: hex(name) }} onClick={() => pickColor(name)} />
          ))}
        </div>
      )}
      {tab === "default" && <p className="hint">T3 Code draws a monogram from the project's name.</p>}
    </div>
  );
}
