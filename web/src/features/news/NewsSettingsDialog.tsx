import { useState } from "react";
import type { DashboardProvider, ModelDefaults, NewsSettings, SaveNewsBody } from "../../../../shared/api.ts";
import { errorMessage } from "../../lib/format.ts";
import { ModelPanel } from "../conversation/ModelPanel.tsx";
import { Dialog, TextArea, TextInput } from "../../ui/index.ts";
import { formFromSettings, pickModel, toBody } from "./news.ts";

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
          <span>Time of day</span>
          <TextInput aria-label="Time of day" type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} />
          <p className="hint">The news runs every day. The time is read in the time zone of the machine that runs T3.</p>
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
