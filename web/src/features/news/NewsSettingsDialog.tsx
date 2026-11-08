import { useState } from "react";
import type { DashboardProvider, ModelDefaults, NewsSettings, SaveNewsBody } from "../../../../shared/api.ts";
import type { NewsFrequency, NewsLanguage } from "../../../../shared/news.ts";
import { errorMessage } from "../../lib/format.ts";
import { ModelPanel } from "../conversation/ModelPanel.tsx";
import { Dialog, Dropdown, Segmented, Switch, TextInput } from "../../ui/index.ts";
import { LANGUAGES, WEEKDAYS, formFromSettings, pickModel, scheduleHint, toBody } from "./news.ts";

interface Props {
  settings: NewsSettings;
  providers: DashboardProvider[];
  defaults: ModelDefaults;
  onSave: (body: SaveNewsBody) => Promise<void>;
  onClose: () => void;
}

/** The news schedule, language and model. Saving updates the T3 routine too. */
export function NewsSettingsDialog({ settings, providers, defaults, onSave, onClose }: Props) {
  const [form, setForm] = useState(() => formFromSettings(settings, pickModel(settings, providers, defaults.selection)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const built = toBody(form);
    if ("error" in built) return setError(built.error);
    setSaving(true);
    setError(null);
    try {
      await onSave(built.body);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Dialog title="News settings" className="news-settings" onClose={onClose} onCancel={onClose} primary={{ label: saving ? "Saving…" : "Save", onClick: () => void save(), disabled: saving }}>
      <div className="auto-form">
        <div className="dialog-field">
          <span>Automatic generation</span>
          <Switch label="Automatic generation" checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
          <p className="hint">{form.enabled ? "The routine writes an article on its schedule." : "Off: the routine is paused. Run now still writes an article."}</p>
        </div>
        {/* A native disabled fieldset greys and locks every schedule control at once. */}
        <fieldset className="news-schedule" disabled={!form.enabled}>
        <div className="dialog-field">
          <span>Frequency</span>
          <Segmented<NewsFrequency> label="Frequency" value={form.frequency} options={[{ id: "daily", label: "Every day" }, { id: "weekly", label: "Every week" }]} onChange={(frequency) => setForm({ ...form, frequency })} />
        </div>
        {form.frequency === "weekly" && (
          <div className="dialog-field">
            <span>Weekday</span>
            <Dropdown label="Weekday" className="field" value={String(form.weekday)} options={[...WEEKDAYS]} onPick={(id) => setForm({ ...form, weekday: Number(id) })} />
          </div>
        )}
        <div className="dialog-field">
          <span>Time of day</span>
          <TextInput aria-label="Time of day" type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} />
          <p className="hint">{scheduleHint(form.frequency, form.weekday)}</p>
        </div>
        </fieldset>
        <div className="dialog-field">
          <span>Language</span>
          <Dropdown label="Language" className="field" value={form.language} options={[...LANGUAGES]} onPick={(id) => setForm({ ...form, language: id as NewsLanguage })} />
        </div>
        <div className="dialog-field">
          <span>Model</span>
          <div className="news-model">
            <ModelPanel inline providers={providers} selection={form.selection} onSelection={(selection) => setForm({ ...form, selection })} />
          </div>
          <p className="hint">The model needs web search. Saving updates the routine in Automations.</p>
        </div>
      </div>
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}
