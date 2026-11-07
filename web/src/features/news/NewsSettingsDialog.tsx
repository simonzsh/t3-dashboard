import { useState } from "react";
import type { DashboardProvider, ModelDefaults, NewsSettings, SaveNewsBody } from "../../../../shared/api.ts";
import { errorMessage } from "../../lib/format.ts";
import { ModelPanel } from "../conversation/ModelPanel.tsx";
import { Button, Choice, Dialog, Dropdown, Segmented, Switch, TextInput } from "../../ui/index.ts";
import { TOPICS_MAX, WEEKDAYS, addTopic, formFromSettings, topicOptions, toggleTopic, pickModel, scheduleHint, toBody, type NewsFrequency } from "./news.ts";

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
  const [draft, setDraft] = useState("");
  const [topicError, setTopicError] = useState<string | null>(null);

  function add() {
    const { error: problem, ...next } = addTopic(form, draft);
    setTopicError(problem ?? null);
    if (problem) return;
    setForm({ ...form, ...next });
    setDraft("");
  }

  const full = form.topics.length >= TOPICS_MAX;

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
          <span>Topics</span>
          <div className="topic-grid" role="group" aria-label="Topics">
            {topicOptions(form.customs).map((topic) => {
              const checked = form.topics.includes(topic);
              return (
                <label key={topic} className="topic-option">
                  <Choice type="checkbox" checked={checked} disabled={!checked && full} onChange={() => setForm({ ...form, topics: toggleTopic(form, topic) })} />
                  <span>{topic}</span>
                </label>
              );
            })}
          </div>
          <div className="topic-add">
            <TextInput aria-label="Add a topic" placeholder="Add a topic" maxLength={60} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            <Button onClick={add} disabled={draft.trim() === ""}>Add</Button>
          </div>
          {topicError && <p className="auto-error" role="alert">{topicError}</p>}
          <p className="hint">{full ? `${TOPICS_MAX} topics checked: uncheck one to pick another.` : `Check up to ${TOPICS_MAX} topics.`}</p>
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
