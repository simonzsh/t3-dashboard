import { useState } from "react";
import type { Automation } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { Dialog } from "../../ui/index.ts";

interface Props {
  automation: Automation;
  onDeleted: () => void;
  onClose: () => void;
}

export function DeleteAutomationDialog({ automation, onDeleted, onClose }: Props) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAutomation(automation.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Delete automation?" onClose={onClose} onCancel={onClose} primary={{ label: busy ? "Deleting…" : "Delete", onClick: () => void confirm(), disabled: busy }}>
      <p>
        <strong>{automation.title}</strong> will no longer run. This cannot be undone.
      </p>
      {error && <p className="notice error-notice">{error}</p>}
    </Dialog>
  );
}
