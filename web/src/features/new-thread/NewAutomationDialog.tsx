import { useEffect, useState } from "react";
import type { Automation, CreateAutomationResult, DashboardProject, DashboardProvider, ModelDefaults, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { loadProjectChoice, saveProjectChoice } from "../../lib/projectChoice.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { findModel } from "../conversation/composer.ts";
import { Composer } from "../conversation/Composer.tsx";
import { Button, Choice, Dialog, Dropdown, Icon, IconButton, Segmented, SecretInput, TextInput, ToggleGroup } from "../../ui/index.ts";
import { FILTER_OPS, WEEKDAY_LABELS, WEEKDAY_ORDER, addFilter, emptyForm, formFromAutomation, promptPlaceholder, removeFilter, toCreateBody, toUpdateBody, toggleWeekday, updateFilter, type AutomationForm, type FilterOp, type FormKind } from "./automationForm.ts";
import { presetSelection } from "./newAgent.ts";

const KEY = "t3-dashboard-automation-project";
// Same default as the server when no mode is sent, used when T3 has none.
const DEFAULT_MODE: RuntimeMode = "full-access";

const KINDS: ReadonlyArray<{ id: FormKind; label: string }> = [
  { id: "routine", label: "Routine" },
  { id: "reminder", label: "Reminder" },
  { id: "webhook", label: "Webhook" },
];

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  defaults: ModelDefaults;
  /** Edit this automation instead of creating one. Its kind stays. */
  automation?: Automation;
  onClose: () => void;
  /** Called after T3 saved the task, so the list can refresh. */
  onSaved: () => void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy(`copy the ${label.toLowerCase()}`);
  return (
    <Button size="sm" onClick={() => copy(text)}>
      <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : `Copy ${label}`}
    </Button>
  );
}

/** What to set in GitHub once the webhook exists. The URL has a token: it is copied, never shown. */
function WebhookCreated({ result, signed, onClose }: { result: CreateAutomationResult; signed: boolean; onClose: () => void }) {
  return (
    <Dialog title="Webhook created" className="new-agent" onClose={onClose} primary={{ label: "Done", onClick: onClose }}>
      <div className="auto-result">
        {result.webhookUrl === null ? (
          <p>T3 Connect remote access is off: turn it on, then copy the URL from the Webhooks list.</p>
        ) : (
          <dl>
            <dt>Payload URL</dt>
            <dd>
              <CopyButton text={result.webhookUrl} label="URL" />
            </dd>
            <dt>Content type</dt>
            <dd>application/json</dd>
            <dt>Secret</dt>
            <dd>{signed ? "The secret you typed" : "Leave it empty"}</dd>
            <dt>Events</dt>
            <dd>The ones you filter on, for example Pull requests</dd>
          </dl>
        )}
        <p className="hint">Each matching request opens a new thread. Copy the URL again at any time from the Webhooks list.</p>
      </div>
    </Dialog>
  );
}

function ScheduleFields({ form, keepSecret, onChange }: { form: AutomationForm; keepSecret: boolean; onChange: (form: AutomationForm) => void }) {
  const set = (change: Partial<AutomationForm>) => onChange({ ...form, ...change });
  if (form.kind === "reminder") {
    return (
      <div className="dialog-field">
        <span>When</span>
        <TextInput aria-label="Date and time" type="datetime-local" value={form.reminderAt} onChange={(e) => set({ reminderAt: e.target.value })} />
        <p className="hint">Runs once, then the dashboard pauses it. The time is in your browser's time zone.</p>
      </div>
    );
  }
  if (form.kind === "routine") {
    return (
      <div className="dialog-field">
        <span>Repeat</span>
        <Segmented label="Repeat" value={form.routineMode} options={[{ id: "fixed", label: "At a time" }, { id: "interval", label: "Every N minutes" }]} onChange={(routineMode) => set({ routineMode })} />
        {form.routineMode === "interval" ? (
          <TextInput aria-label="Minutes" type="number" min={1} max={525600} value={form.minutes} onChange={(e) => set({ minutes: e.target.value })} />
        ) : (
          <>
            <TextInput aria-label="Time" type="time" value={form.timeOfDay} onChange={(e) => set({ timeOfDay: e.target.value })} />
            <ToggleGroup label="Days" value={form.weekdays} options={WEEKDAY_ORDER.map((day) => ({ id: day, label: WEEKDAY_LABELS[day] }))} onToggle={(day) => onChange(toggleWeekday(form, day))} />
            <p className="hint">No day picked means every day. The time is read in the time zone of the machine that runs T3.</p>
          </>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="dialog-field">
        <span>Filters</span>
        <p className="hint">Only requests that match every filter start a run. Paths start with body, headers or query.</p>
        {form.filters.map((row) => (
          <div key={row.id} className="auto-form-row">
            <TextInput aria-label="Filter path" placeholder="headers.x-github-event" value={row.path} onChange={(e) => onChange(updateFilter(form, row.id, { path: e.target.value }))} />
            <Dropdown label="Filter operator" className="field" value={row.op} options={FILTER_OPS.map((op) => ({ id: op.id, label: op.label }))} onPick={(op) => onChange(updateFilter(form, row.id, { op: op as FilterOp }))} />
            {row.op !== "exists" && <TextInput aria-label="Filter value" placeholder={row.op === "in" ? "a, b" : "pull_request"} value={row.value} onChange={(e) => onChange(updateFilter(form, row.id, { value: e.target.value }))} />}
            <IconButton label="Remove filter" size="sm" variant="ghost" onClick={() => onChange(removeFilter(form, row.id))}>
              <Icon name="trash" />
            </IconButton>
          </div>
        ))}
        <div className="auto-form-row">
          <Button size="sm" disabled={form.filters.length >= 16} onClick={() => onChange(addFilter(form))}>
            Add filter
          </Button>
        </div>
      </div>
      <div className="dialog-field">
        <label className="auto-check">
          <Choice type="checkbox" checked={form.signed} onChange={(e) => set({ signed: e.target.checked })} />
          Check the signature
        </label>
        {form.signed && (
          <>
            <div className="auto-form-row">
              <TextInput aria-label="Signature header" value={form.header} onChange={(e) => set({ header: e.target.value })} />
              <Dropdown label="Encoding" className="field" value={form.encoding} options={[{ id: "hex", label: "hex" }, { id: "base64", label: "base64" }]} onPick={(encoding) => set({ encoding: encoding as "hex" | "base64" })} />
              <TextInput aria-label="Signature prefix" value={form.prefix} onChange={(e) => set({ prefix: e.target.value })} />
            </div>
            <SecretInput aria-label="Signing secret" placeholder={keepSecret ? "Unchanged" : "Signing secret (the same one goes in GitHub)"} value={form.secret} onChange={(e) => set({ secret: e.target.value })} />
            <p className="hint">{keepSecret ? "Leave it empty to keep the stored secret. " : ""}Sent once to T3, which stores it. The dashboard never keeps it.</p>
          </>
        )}
      </div>
    </>
  );
}

/** A form that creates the routine, reminder or webhook in T3, or edits an existing one. */
export function NewAutomationDialog({ projects, providers, defaults, automation, onClose, onSaved }: Props) {
  const api = useApi();
  const editing = automation !== undefined;
  // The project of an edited task may be gone from the list: show no project, not a wrong one.
  const [projectId, setProjectId] = useState(() => (automation ? (projects.some((p) => p.id === automation.projectId) ? automation.projectId : "") : loadProjectChoice(browserStorage(), KEY, projects)));
  const [selection, setSelection] = useState<ModelSelection | null>(() => automation?.modelSelection ?? presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  const [mode, setMode] = useState<RuntimeMode>(automation?.runtimeMode ?? defaults.runtimeMode ?? DEFAULT_MODE);
  const [draft, setDraft] = useState(automation?.prompt ?? "");
  const [form, setForm] = useState(() => (automation ? formFromAutomation(automation, new Date()) : emptyForm()));
  const [created, setCreated] = useState<{ result: CreateAutomationResult; signed: boolean } | null>(null);
  // Each project pick moves the focus to the message.
  const [picks, setPicks] = useState(0);

  // Providers can arrive after the dialog opens: pick a preset once the choice is no longer valid.
  // An edit never replaces its stored model, even when the providers do not list it.
  useEffect(() => {
    if (editing ? selection === null : !findModel(providers, selection)) setSelection(presetSelection(projects.find((p) => p.id === projectId), providers, defaults.selection));
  }, [providers]);

  async function send(text: string): Promise<void> {
    const base = { prompt: text, projectId, modelSelection: selection, runtimeMode: mode };
    // The body holds the secret: the field is empty before the request leaves.
    const clearSecret = () => setForm((current) => ({ ...current, secret: "" }));
    if (automation) {
      const built = toUpdateBody(form, base, new Date(), automation.webhook?.signed === true);
      if ("error" in built) throw new Error(built.error);
      clearSecret();
      await api.updateAutomation(automation.id, built.body);
      onSaved();
      onClose();
      return;
    }
    const built = toCreateBody(form, base, new Date());
    if ("error" in built) throw new Error(built.error);
    const signed = built.body.kind === "webhook" && built.body.signature !== null;
    clearSecret();
    const result = await api.createAutomation(built.body);
    saveProjectChoice(browserStorage(), KEY, projectId);
    onSaved();
    if (built.body.kind === "webhook") setCreated({ result, signed });
    else onClose();
  }

  function changeSettings(change: ThreadSettingsBody) {
    if (change.modelSelection) setSelection(change.modelSelection);
    if (change.runtimeMode) setMode(change.runtimeMode);
  }

  if (created) return <WebhookCreated {...created} onClose={onClose} />;

  return (
    <Dialog title={automation ? `Edit ${automation.kind}` : "New automation"} className="new-agent" onClose={onClose}>
      <div className="auto-form">
        {automation ? (
          <div className="dialog-field">
            <span>Title</span>
            <TextInput aria-label="Title" maxLength={120} placeholder="First line of the prompt" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
        ) : (
          <Segmented label="Kind" value={form.kind} options={KINDS} onChange={(kind) => setForm({ ...form, kind })} />
        )}
        <div className="dialog-field">
          <span>Project</span>
          <ProjectPicker
            label="Project"
            projects={projects}
            value={projectId}
            allowNone
            disabled={automation?.bound}
            onPicked={() => setPicks((n) => n + 1)}
            onPick={(id) => {
              setProjectId(id);
              if (!editing) setSelection(presetSelection(projects.find((p) => p.id === id), providers, defaults.selection));
            }}
          />
          {automation?.bound && <p className="hint">Runs in its own thread: the project is fixed.</p>}
        </div>
        <ScheduleFields form={form} keepSecret={automation?.webhook?.signed === true} onChange={setForm} />
      </div>
      <Composer
        providers={providers}
        selection={selection}
        runtimeMode={mode}
        running={false}
        draft={draft}
        onDraft={setDraft}
        onSend={send}
        onSettings={changeSettings}
        errorResetKey={projectId}
        placeholder={promptPlaceholder(form.kind)}
        noImages
        focusKey={picks || undefined}
      />
    </Dialog>
  );
}
