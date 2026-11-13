import { useState } from "react";
import type { SetupInfo } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { setupCopy } from "./setup.ts";
import { Button, CardHead, Icon, IconButton, Logo, SecretInput } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";
import { useCopy } from "../../lib/useCopy.ts";

function CommandBox({ command }: { command: string }) {
  const { copied, copy } = useCopy("copy the command");
  return (
    <div className="setup-command">
      <code>{command}</code>
      <IconButton variant="ghost" size="sm" label={copied ? "Copied" : "Copy command"} onClick={() => copy(command)}>
        <Icon name={copied ? "check" : "copy"} />
      </IconButton>
    </div>
  );
}

// The screen goes away by itself: the next `connection` event carries `setup: null`.
export function SetupScreen({ setup }: { setup: SetupInfo }) {
  const api = useApi();
  const copy = setupCopy(setup);
  const [token, setToken] = useState("");
  const retry = useAction("retry the connection");
  const paste = useAction("save the token");

  return (
    <div className="setup">
      <div className="setup-column">
        <div className="setup-brand">
          <Logo />
          <span>T3 Dashboard</span>
        </div>
        <section className="card setup-card" aria-labelledby="setup-title">
          <CardHead
            id="setup-title"
            icon={setup.reason === "token-needed" ? "lock" : "server"}
            title={copy.title}
            actions={
              <span className="conn down">
                <span className="conn-dot" />
                Not connected
              </span>
            }
          />
          <div className="setup-body">
            <p className="setup-lede">{copy.lede}</p>
            {setup.detail && <p className="setup-detail">{setup.detail}</p>}
            <ol className="setup-steps">
              {copy.steps.map((step, index) => (
                <li key={step.text}>
                  <span className="setup-step-number">{index + 1}</span>
                  <div className="setup-step-body">
                    <span>{step.text}</span>
                    {step.command && <CommandBox command={step.command} />}
                    {copy.showPaste && index === copy.steps.length - 1 && (
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
                        <Button type="submit" loading={paste.busy && "Checking…"} disabled={token.trim() === ""}>
                          Save token
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="setup-foot">
            {copy.link ? (
              <a className="setup-link" href={copy.link.url} target="_blank" rel="noreferrer">
                {copy.link.label}
                <Icon name="arrowUpRight" />
              </a>
            ) : (
              <span />
            )}
            <Button variant="primary" loading={retry.busy && "Retrying…"} onClick={() => void retry.run(() => api.retrySetup())}>
              Retry
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
