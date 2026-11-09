import { useEffect, useState } from "react";
import type { AlertsSettings as AlertsSettingsData, AlertTestResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Button, Icon, IconButton, Loader } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";
import { SETUP_STEPS, testMessage } from "./alertsSettings.ts";

function CopyValue({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy(`copy the ${label.toLowerCase()}`);
  return (
    <span className="linear-status">
      <small className="muted">{label}</small>
      <code className="key-mask">{value}</code>
      <IconButton label={`Copy the ${label.toLowerCase()}`} tooltip={copied ? "Copied" : "Copy"} size="sm" onClick={() => copy(value)}>
        <Icon name={copied ? "check" : "copy"} strokeWidth={1.8} />
      </IconButton>
    </span>
  );
}

/** Settings > Connections > Alerts: the ntfy topic that carries phone alerts. The server holds it; this block sets it up. */
export function AlertsSettings() {
  const api = useApi();
  const [settings, setSettings] = useState<AlertsSettingsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tested, setTested] = useState<AlertTestResult["result"] | null>(null);
  const notify = useNotify();
  const action = useAction("change the alerts");
  const test = useAction("send the test alert");

  useEffect(() => {
    api.getAlertsSettings().then(setSettings, (e: unknown) => {
      setLoadError(true);
      notify(failure("load the alert settings", e));
    });
  }, []);

  if (!settings) return loadError ? <p className="empty">The alert settings could not be loaded.</p> : <Loader />;

  const change = (fn: () => Promise<AlertsSettingsData>) =>
    void action.run(async () => {
      setSettings(await fn());
      setTested(null);
    });

  const intro = <small className="muted">Phone alerts through ntfy.</small>;

  if (!settings.connected) {
    return (
      <>
        <div className="settings-row">
          <span>Alerts</span>
          {intro}
          <span className="linear-status muted">Not set up</span>
          <ol className="install-steps">
            {SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Button variant="primary" disabled={action.busy} onClick={() => change(() => api.setupAlerts())}>
            Set up
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="settings-row">
      <span>Alerts</span>
      {intro}
      <span className="linear-controls">
        <span className="conn up">
          <span className="conn-dot" /> Connected
        </span>
        <span className="row-icons">
          <IconButton label="Disconnect" tooltip="Disconnect" size="sm" disabled={action.busy} onClick={() => change(api.disconnectAlerts)}>
            <Icon name="logOut" strokeWidth={1.8} />
          </IconButton>
        </span>
      </span>
      {settings.server && <CopyValue label="Server" value={settings.server} />}
      {settings.topic && <CopyValue label="Topic" value={settings.topic} />}
      <p className="install-steps">
        In the ntfy app, subscribe to this topic
        {settings.subscribeUrl && (
          <>
            {" "}
            or open{" "}
            <a className="setup-link" href={settings.subscribeUrl} target="_blank" rel="noreferrer">
              the subscribe link
            </a>
          </>
        )}
        .
      </p>
      <span className="linear-controls">
        <Button loading={test.busy && "Sending…"} onClick={() => void test.run(async () => setTested((await api.testAlerts()).result))}>
          Send test alert
        </Button>
        {tested && <small className="muted">{testMessage(tested)}</small>}
      </span>
    </div>
  );
}
