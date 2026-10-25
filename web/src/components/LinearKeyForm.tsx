import { useState } from "react";
import type { SettingsResult } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { Button, SecretInput } from "../ui/index.ts";
import { useAction } from "./useAction.ts";

interface Props {
  button: string;
  onSaved: (result: SettingsResult) => void;
}

// The server checks the key with Linear before it saves it; the error says what went wrong.
export function LinearKeyForm({ button, onSaved }: Props) {
  const [key, setKey] = useState("");
  const { busy, error, run } = useAction();
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
      {error && <span className="error">{error}</span>}
    </form>
  );
}
