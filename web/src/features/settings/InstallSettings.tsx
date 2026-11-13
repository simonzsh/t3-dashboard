import { useEffect, useState } from "react";
import type { RemoteAccess } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useAction } from "../../lib/useAction.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { Button, Icon, IconButton, Loader } from "../../ui/index.ts";
import { detectDevice, phoneStep, TAILSCALE_DOWNLOAD } from "./install.ts";
import { qrPath } from "./qr.ts";

export function InstallSettings() {
  const standalone = useMediaQuery("(display-mode: standalone)");
  const device = detectDevice({ userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints });
  return (
    <div className="settings-row">
      <span>Install on your phone</span>
      {device === "desktop" ? <QrInstall /> : <p className="install-steps">{standalone ? "Installed." : phoneStep(device)}</p>}
    </div>
  );
}

function QrInstall() {
  const api = useApi();
  const action = useAction("enable remote access");
  const [access, setAccess] = useState<RemoteAccess | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [enabling, setEnabling] = useState(false);

  async function check() {
    setChecking(true);
    setLoadError(false);
    try { setAccess(await api.getRemoteAccess()); }
    catch { setLoadError(true); }
    finally { setChecking(false); }
  }
  useEffect(() => { void check(); }, []);

  return <RemoteAccessView
    access={access}
    loadError={loadError}
    checking={checking}
    enabling={enabling}
    onCheck={() => void check()}
    onEnable={() => void action.run(async () => setAccess(await api.enableRemoteAccess()), setEnabling)}
  />;
}

interface ViewProps {
  access: RemoteAccess | null;
  loadError: boolean;
  checking: boolean;
  enabling: boolean;
  onEnable(): void;
  onCheck(): void;
}

export function RemoteAccessView({ access, loadError, checking, enabling, onEnable, onCheck }: ViewProps) {
  const checkButton = (
    <Button size="sm" disabled={checking || enabling} onClick={onCheck}>
      <Icon name="refresh" className={checking ? "icon spinning" : "icon"} /> Check again
    </Button>
  );
  const signIn = <>
    <li>Sign in to the same tailnet on both.</li>
    <li>Come back and press Check again.</li>
  </>;

  if (loadError) return <div className="install-box"><p className="install-steps">The remote access status could not be loaded.</p>{checkButton}</div>;
  if (!access) return <Loader inline label="Checking Tailscale" />;

  switch (access.state) {
    case "not-installed":
      return <div className="install-box">
        <p className="install-steps">Your phone reaches the dashboard through Tailscale.</p>
        <ol className="install-steps">
          <li>Install Tailscale on this machine and on your phone: <a className="setup-link" href={TAILSCALE_DOWNLOAD} target="_blank" rel="noreferrer">{TAILSCALE_DOWNLOAD}</a></li>
          {signIn}
        </ol>
        {checkButton}
      </div>;
    case "stopped":
      return <div className="install-box">
        <p className="install-steps">Tailscale is installed but not running or not signed in.</p>
        <ol className="install-steps">{signIn}</ol>
        {checkButton}
      </div>;
    case "needs-enable":
      return <NeedsEnable access={access} enabling={enabling} onEnable={onEnable} checkButton={checkButton} />;
    case "error":
      return <div className="install-box"><p className="install-error">{access.message}</p>{checkButton}</div>;
    case "ready":
      return <Ready url={access.url} />;
  }
}

function NeedsEnable({ access, enabling, onEnable, checkButton }: { access: Extract<RemoteAccess, { state: "needs-enable" }>; enabling: boolean; onEnable(): void; checkButton: React.ReactNode }) {
  const copy = useCopy("copy the command");
  const failed = access.error !== null;
  const enableButton = <Button variant="primary" size="sm" loading={enabling ? "Enabling…" : false} onClick={onEnable}>{failed ? "Enable again" : "Enable"}</Button>;
  return (
    <div className="install-box">
      {failed ? <>
        <p className="install-error">{access.error}</p>
        {access.approveUrl && <a className="setup-link" href={access.approveUrl} target="_blank" rel="noreferrer">Approve in Tailscale</a>}
        <span className="linear-controls">
          <code className="install-command">{access.command}</code>
          <IconButton size="sm" label="Copy the command" tooltip="Copy the command" onClick={() => copy.copy(access.command)}><Icon name={copy.copied ? "check" : "copy"} /></IconButton>
        </span>
      </> : <p className="install-steps">Tailscale runs, but it does not share the dashboard yet. Enable makes it reachable from your devices on your tailnet only.</p>}
      <span className="linear-controls">{enableButton}{enabling && <Loader inline label="Enabling" />}{failed && checkButton}</span>
    </div>
  );
}

function Ready({ url }: { url: string }) {
  const copy = useCopy("copy the link");
  return (
    <div className="install-box">
      <QrCode text={url} />
      <span className="linear-controls">
        <a className="setup-link install-url" href={url} target="_blank" rel="noreferrer">{url}</a>
        <IconButton size="sm" label="Copy the link" tooltip="Copy the link" onClick={() => copy.copy(url)}><Icon name={copy.copied ? "check" : "copy"} /></IconButton>
      </span>
      <ol className="install-steps">
        <li>Scan the code with the phone camera and open the link.</li>
        <li>iPhone: tap Share, then Add to Home Screen. Android: open the browser menu (⋮), then Add to Home screen.</li>
      </ol>
    </div>
  );
}

function QrCode({ text }: { text: string }) {
  const { size, d } = qrPath(text);
  return (
    <svg className="install-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code of the dashboard address" shapeRendering="crispEdges">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
