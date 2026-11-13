import { useEffect, useState, type ReactNode } from "react";
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
  const action = useAction("set up remote access");
  const [access, setAccess] = useState<RemoteAccess | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

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
    signingIn={signingIn}
    onCheck={() => void check()}
    onEnable={() => void action.run(async () => setAccess(await api.enableRemoteAccess()), setEnabling)}
    onSignIn={() => void action.run(async () => setAccess(await api.loginRemoteAccess()), setSigningIn)}
  />;
}

interface ViewProps {
  access: RemoteAccess | null;
  loadError: boolean;
  checking: boolean;
  enabling: boolean;
  signingIn: boolean;
  onEnable(): void;
  onSignIn(): void;
  onCheck(): void;
}

export function RemoteAccessView({ access, loadError, checking, enabling, signingIn, onEnable, onSignIn, onCheck }: ViewProps) {
  const checkButton = (
    <Button size="sm" disabled={checking || enabling || signingIn} onClick={onCheck}>
      <Icon name="refresh" className={checking ? "icon spinning" : "icon"} /> Check again
    </Button>
  );
  const downloadLink = <a className="setup-link" href={TAILSCALE_DOWNLOAD} target="_blank" rel="noreferrer">{TAILSCALE_DOWNLOAD}</a>;
  const signIn = <>
    <li>Sign in to the same tailnet on both.</li>
    <li>Come back and press Check again. {checkButton}</li>
  </>;

  if (loadError) return <div className="install-box"><p className="install-steps">The remote access status could not be loaded.</p>{checkButton}</div>;
  if (!access) return <Loader inline label="Checking Tailscale" />;

  switch (access.state) {
    case "not-installed":
      return <div className="install-box">
        <p className="install-steps">Your phone reaches the dashboard through Tailscale.</p>
        <ol className="install-steps">
          <li>Install Tailscale on this machine: {access.installCommand ? <CommandBlock command={access.installCommand} /> : downloadLink}</li>
          <li>Install the Tailscale app on your phone: {downloadLink}</li>
          {signIn}
        </ol>
      </div>;
    case "stopped":
      return <div className="install-box">
        <p className="install-steps">Tailscale is installed but not running or not signed in.</p>
        <ol className="install-steps">{signIn}</ol>
      </div>;
    case "needs-login":
      return <NeedsLogin access={access} signingIn={signingIn} onSignIn={onSignIn} checkButton={checkButton} />;
    case "needs-enable":
      return <NeedsEnable access={access} enabling={enabling} onEnable={onEnable} checkButton={checkButton} />;
    case "error":
      return <div className="install-box"><p className="install-error">{access.message}</p>{checkButton}</div>;
    case "ready":
      return <Ready url={access.url} />;
  }
}

function CommandBlock({ command }: { command: string }) {
  const copy = useCopy("copy the command");
  return (
    <span className="linear-controls">
      <code className="install-command">{command}</code>
      <IconButton size="sm" label="Copy the command" tooltip="Copy the command" onClick={() => copy.copy(command)}><Icon name={copy.copied ? "check" : "copy"} /></IconButton>
    </span>
  );
}

function NeedsLogin({ access, signingIn, onSignIn, checkButton }: { access: Extract<RemoteAccess, { state: "needs-login" }>; signingIn: boolean; onSignIn(): void; checkButton: ReactNode }) {
  return (
    <div className="install-box">
      <p className="install-steps">Tailscale is installed but this machine is not signed in.</p>
      {access.error && <>
        <p className="install-error">{access.error}</p>
        <CommandBlock command={access.command} />
      </>}
      {access.loginUrl && <>
        <a className="setup-link" href={access.loginUrl} target="_blank" rel="noreferrer">Open the sign-in page</a>
        <QrCode text={access.loginUrl} label="QR code of the Tailscale sign-in page" />
        <p className="install-steps">Or scan it to sign in from your phone. Then press Check again.</p>
      </>}
      <span className="linear-controls">
        <Button variant="primary" size="sm" loading={signingIn ? "Signing in…" : false} onClick={onSignIn}>Sign in</Button>
        {signingIn && <Loader inline label="Signing in" />}
        {checkButton}
      </span>
    </div>
  );
}

function NeedsEnable({ access, enabling, onEnable, checkButton }: { access: Extract<RemoteAccess, { state: "needs-enable" }>; enabling: boolean; onEnable(): void; checkButton: ReactNode }) {
  const failed = access.error !== null;
  const enableButton = <Button variant="primary" size="sm" loading={enabling ? "Enabling…" : false} onClick={onEnable}>{failed ? "Enable again" : "Enable"}</Button>;
  return (
    <div className="install-box">
      {failed ? <>
        <p className="install-error">{access.error}</p>
        {access.approveUrl && <a className="setup-link" href={access.approveUrl} target="_blank" rel="noreferrer">Approve in Tailscale</a>}
        <CommandBlock command={access.command} />
      </> : <p className="install-steps">Tailscale runs, but it does not share the dashboard yet. Enable makes it reachable only through your tailnet. The dashboard has no login, so share it only with devices you trust.</p>}
      <span className="linear-controls">{enableButton}{enabling && <Loader inline label="Enabling" />}{failed && checkButton}</span>
    </div>
  );
}

function Ready({ url }: { url: string }) {
  const copy = useCopy("copy the link");
  return (
    <div className="install-box">
      <QrCode text={url} label="QR code of the dashboard address" />
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

function QrCode({ text, label }: { text: string; label: string }) {
  const { size, d } = qrPath(text);
  return (
    <svg className="install-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
