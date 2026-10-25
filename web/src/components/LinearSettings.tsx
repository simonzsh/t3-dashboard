import { useEffect, useState } from "react";
import type { SettingsResult } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { KEY_URL, maskedKey } from "../linearSettings.ts";
import { LinearKeyForm } from "./LinearKeyForm.tsx";
import { useAction } from "./useAction.ts";

interface Props {
  onChange: () => void;
}

export function LinearSettings({ onChange }: Props) {
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [changing, setChanging] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    api.getSettings().then(setSettings, (e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  function saved(next: SettingsResult) {
    setSettings(next);
    setChanging(false);
    onChange();
  }

  if (!settings) return <p className="empty">{loadError ?? "Loading…"}</p>;
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
          <div className="buttons">
            <button type="button" onClick={() => setChanging(!changing)}>
              Change key
            </button>
            <button
              type="button"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  saved(await api.disconnectLinear());
                })
              }
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
      {(!linear.connected || changing) && (
        <div className="key-box">
          <small>
            Create a key in Linear under Settings → Account → Security &amp; access.{" "}
            <a href={KEY_URL} target="_blank" rel="noreferrer">
              Open the page
            </a>
          </small>
          <LinearKeyForm button={linear.connected ? "Save key" : "Connect"} onSaved={saved} />
        </div>
      )}
      {linear.legacy && <p className="notice">Your Linear file uses the old workspaces list. The next save keeps only the first workspace that has a key.</p>}
      {action.error && <span className="error">{action.error}</span>}
    </>
  );
}
