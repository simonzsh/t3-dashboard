import { useState } from "react";
import type { Automation } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";
import { Dialog } from "../../ui/index.ts";

interface Props {
  automation: Automation;
  onDeleted: () => void;
  onClose: () => void;
}

export function DeleteAutomationDialog({ automation, onDeleted, onClose }: Props) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  async function confirm() {
    setBusy(true);
    try {
      await api.deleteAutomation(automation.id);
      onDeleted();
    } catch (e) {
      notify(failure("delete the automation", e));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Delete automation?" onClose={onClose} onCancel={onClose} primary={{ label: busy ? "Deleting…" : "Delete", onClick: () => void confirm(), disabled: busy }}>
      <p>
        <strong>{automation.title}</strong> will no longer run. This cannot be undone.
      </p>
    </Dialog>
  );
}
