import { useEffect, useState } from "react";
import type { SettingsResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { KEY_PATH, KEY_URL, maskedKey } from "./linearSettings.ts";
import { Icon, IconButton, Loader } from "../../ui/index.ts";
import { LinearKeyForm } from "./LinearKeyForm.tsx";
import { useAction } from "../../lib/useAction.ts";
import { errorMessage } from "../../lib/format.ts";

interface Props {
  onChange: () => void;
}

export function LinearSettings({ onChange }: Props) {
  const api = useApi();
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [changing, setChanging] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    api.getSettings().then(setSettings, (e: unknown) => setLoadError(errorMessage(e)));
  }, []);

  function saved(next: SettingsResult) {
    setSettings(next);
    setChanging(false);
    onChange();
  }

  if (!settings) return loadError ? <p className="empty">{loadError}</p> : <Loader />;
  const { linear } = settings;

  return (
    <>
      <div className="settings-row">
        {linear.connected ? (
          <span className="linear-status">
            <span className="conn up">
              <span className="conn-dot" /> Connected
            </span>
            {linear.keyTail && <code className="key-mask">{maskedKey(linear.keyTail)}</code>}
          </span>
        ) : (
          <span className="linear-status muted">Not connected</span>
        )}
        {linear.connected && (
          <span className="row-icons">
            <IconButton label="Change key" tooltip="Change key" size="sm" aria-expanded={changing} onClick={() => setChanging(!changing)}>
              <Icon name="pencil" strokeWidth={1.8} />
            </IconButton>
            <IconButton
              label="Disconnect"
            tooltip="Disconnect"
              size="sm"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  saved(await api.disconnectLinear());
                })
              }
            >
              <Icon name="logOut" strokeWidth={1.8} />
            </IconButton>
          </span>
        )}
      </div>
      {(!linear.connected || changing) && (
        <div className="key-box">
          <small>
            Create a key in Linear under {KEY_PATH.slice(0, 3).join(" → ")}.{" "}
            <a href={KEY_URL} target="_blank" rel="noreferrer">
              Open the page
            </a>
          </small>
          <LinearKeyForm button={linear.connected ? "Save key" : "Connect"} onSaved={saved} />
        </div>
      )}
      {action.error && <span className="error">{action.error}</span>}
    </>
  );
}
