import { useEffect, useState } from "react";
import type { AlertsSettings as AlertsSettingsData, AlertTestResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Button, Icon, IconButton, IconButtonLink, Loader } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";
import { maskedTopic, SETUP_STEPS, testMessage } from "./alertsSettings.ts";

/** Settings > Connections > Alerts: the ntfy topic that carries phone alerts. The server holds it; this block sets it up. */
export function AlertsSettings() {
  const api = useApi();
  const [settings, setSettings] = useState<AlertsSettingsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tested, setTested] = useState<AlertTestResult["result"] | null>(null);
  const notify = useNotify();
  const action = useAction("change the alerts");
  const test = useAction("send the test alert");
  const { copied, copy } = useCopy("copy the topic");

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
              <li key={step.text}>
                {step.text}
                {step.links?.map((link, i) => (
                  <span key={link.url}>
                    {i === 0 ? " " : " or "}
                    <a className="setup-link" href={link.url} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  </span>
                ))}
                {step.links && "."}
              </li>
            ))}
          </ol>
          <Button variant="primary" disabled={action.busy} onClick={() => change(() => api.setupAlerts())}>
            Set up
          </Button>
        </div>
      </>
    );
  }

  // One line, like Linear: the topic is all the user needs to subscribe; the server is always ntfy.sh.
  return (
    <div className="settings-row">
      <span>Alerts</span>
      <span className="linear-controls">
        <span className="linear-status">
          <span className="conn up">
            <span className="conn-dot" /> Connected
          </span>
          {settings.topic && <code className="key-mask">{maskedTopic(settings.topic)}</code>}
        </span>
        <span className="row-icons">
          {settings.topic && (
            <IconButton label="Copy the topic" tooltip={copied ? "Copied" : "Copy the topic"} size="sm" onClick={() => copy(settings.topic!)}>
              <Icon name={copied ? "check" : "copy"} strokeWidth={1.8} />
            </IconButton>
          )}
          {settings.subscribeUrl && (
            <IconButtonLink href={settings.subscribeUrl} target="_blank" rel="noreferrer" label="Subscribe in the ntfy app" tooltip="Subscribe in the ntfy app" size="sm">
              <Icon name="arrowUpRight" strokeWidth={1.8} />
            </IconButtonLink>
          )}
          <IconButton label="Send test alert" tooltip="Send test alert" size="sm" disabled={test.busy} onClick={() => void test.run(async () => setTested((await api.testAlerts()).result))}>
            <Icon name="vibrate" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Disconnect" tooltip="Disconnect" size="sm" disabled={action.busy} onClick={() => change(api.disconnectAlerts)}>
            <Icon name="logOut" strokeWidth={1.8} />
          </IconButton>
        </span>
      </span>
      {tested && <small className="muted">{testMessage(tested)}</small>}
    </div>
  );
}
