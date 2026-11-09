import { useEffect, useState } from "react";
import type { GitHubConnection } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { IconButton, Icon, Loader } from "../../ui/index.ts";

const LABELS = {
  connected: "Connected",
  "not-connected": "Not connected",
  "not-installed": "Not installed",
  error: "Check failed",
};

export function GitHubConnectionStatus({ status }: { status: GitHubConnection["status"] }) {
  return <span className={status === "connected" ? "conn up" : "linear-status muted"}>
    {status === "connected" && <span className="conn-dot" />}{LABELS[status]}
  </span>;
}

export function GitHubSettings() {
  const api = useApi();
  const [status, setStatus] = useState<GitHubConnection["status"] | null>(null);
  const [busy, setBusy] = useState(true);
  async function check() {
    setBusy(true);
    try { setStatus((await api.getGitHubConnection()).status); }
    catch { setStatus("error"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void check(); }, []);

  return <>
    <div className="settings-row">
      <span>GitHub CLI</span>
      <span className="linear-controls">
        {busy ? <Loader inline label="Checking GitHub CLI" /> : status && <GitHubConnectionStatus status={status} />}
        <IconButton size="sm" label="Check GitHub connection" tooltip="Check again" disabled={busy} onClick={() => void check()}><Icon name="refresh" className={busy ? "icon spinning" : "icon"} /></IconButton>
      </span>
    </div>
    {status && status !== "connected" && <div className="key-box"><small>
      {status === "not-installed" ? <>Install <a href="https://cli.github.com" target="_blank" rel="noreferrer">GitHub CLI</a> on the dashboard server, then run <code>gh auth login --hostname github.com</code>.</> :
        status === "not-connected" ? <>Run <code>gh auth login --hostname github.com</code> as the user that runs the dashboard, then check again.</> :
        "The server could not check GitHub CLI. Try again."}
    </small></div>}
  </>;
}
