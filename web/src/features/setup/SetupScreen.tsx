import { useState } from "react";
import type { SetupInfo } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { setupCopy } from "./setup.ts";
import { Button, SecretInput } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

// The screen goes away by itself: the next `connection` event carries `setup: null`.
export function SetupScreen({ setup }: { setup: SetupInfo }) {
  const api = useApi();
  const copy = setupCopy(setup);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const retry = useAction();
  const paste = useAction();

  async function copyCommand(command: string) {
    await navigator.clipboard.writeText(command).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="setup">
      <section className="setup-card" aria-labelledby="setup-title">
        <h1>T3 Dashboard</h1>
        <h2 id="setup-title">{copy.title}</h2>
        {setup.detail && <p className="setup-detail">{setup.detail}</p>}
        <ol className="setup-steps">
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {copy.command && (
          <div className="setup-command">
            <code>{copy.command}</code>
            <Button onClick={() => void copyCommand(copy.command!)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
        )}
        {copy.link && (
          <a className="setup-link" href={copy.link.url} target="_blank" rel="noreferrer">
            {copy.link.label}
          </a>
        )}
        {copy.showPaste && (
          <form
            className="setup-paste"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              void paste.run(async () => {
                await api.pasteToken(token);
                setToken("");
              });
            }}
          >
            <SecretInput id="t3-access-key-field" aria-label="T3 Code access key" placeholder="Paste it here" value={token} onChange={(e) => setToken(e.target.value)} />
            <Button variant="primary" type="submit" loading={paste.busy && "Checking…"} disabled={token.trim() === ""}>
              Save token
            </Button>
          </form>
        )}
        {paste.error && <span className="error">{paste.error}</span>}
        <div className="buttons">
          <Button loading={retry.busy && "Retrying…"} onClick={() => void retry.run(() => api.retrySetup())}>
            Retry
          </Button>
          {retry.error && <span className="error">{retry.error}</span>}
        </div>
      </section>
    </div>
  );
}
