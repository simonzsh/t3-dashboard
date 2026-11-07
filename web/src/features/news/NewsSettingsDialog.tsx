import { useState } from "react";
import type { DashboardProvider, ModelDefaults, NewsSettings, SaveNewsBody } from "../../../../shared/api.ts";
import { errorMessage } from "../../lib/format.ts";
import { ModelPanel } from "../conversation/ModelPanel.tsx";
import { Dialog, Dropdown, Segmented, Switch, TextArea, TextInput } from "../../ui/index.ts";
import { WEEKDAYS, formFromSettings, pickModel, scheduleHint, toBody, type NewsFrequency } from "./news.ts";

interface Props {
  settings: NewsSettings;
  providers: DashboardProvider[];
  defaults: ModelDefaults;
  onSave: (body: SaveNewsBody) => Promise<void>;
  onClose: () => void;
}

/** The news schedule, topics, language and model. Saving updates the T3 routine too. */
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
        <div className="dialog-field">
          <span>Topics</span>
          <TextArea aria-label="Topics" rows={4} placeholder={"AI\nSoftware development"} value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} />
          <p className="hint">One topic per line, up to 10.</p>
        </div>
        <div className="dialog-field">
          <span>Language</span>
          <TextInput aria-label="Language" maxLength={40} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
        </div>
        <div className="dialog-field">
          <span>Model</span>
          <div className="news-model">
            <ModelPanel providers={providers} selection={form.selection} onSelection={(selection) => setForm({ ...form, selection })} />
          </div>
          <p className="hint">The model needs web search. Saving updates the routine in Automations.</p>
        </div>
      </div>
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}
