import { useState } from "react";
import type { SettingsResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Button, SecretInput } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

interface Props {
  button: string;
  onSaved: (result: SettingsResult) => void;
}

// The server checks the key with Linear before it saves it; the error says what went wrong.
export function LinearKeyForm({ button, onSaved }: Props) {
  const api = useApi();
  const [key, setKey] = useState("");
  const { busy, run } = useAction("connect Linear");
  return (
    <form
      className="key-form"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const result = await api.connectLinear(key);
          setKey("");
          onSaved(result);
        });
      }}
    >
      <div className="key-row">
        <SecretInput id="linear-api-key-field" aria-label="Linear API key" placeholder="lin_api_…" value={key} onChange={(e) => setKey(e.target.value)} />
        <Button variant="primary" type="submit" loading={busy && "Checking…"} disabled={key.trim() === ""}>
          {button}
        </Button>
      </div>
    </form>
  );
}
