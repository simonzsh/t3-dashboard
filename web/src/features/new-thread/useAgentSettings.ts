import { useState } from "react";
import type { ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../../shared/api.ts";

/** The model and access of an agent being set up, changed by the composer's model panel. */
export function useAgentSettings(initialSelection: () => ModelSelection | null, initialMode: RuntimeMode) {
  const [selection, setSelection] = useState<ModelSelection | null>(initialSelection);
  const [mode, setMode] = useState<RuntimeMode>(initialMode);
  function changeSettings(change: ThreadSettingsBody) {
    if (change.modelSelection) setSelection(change.modelSelection);
    if (change.runtimeMode) setMode(change.runtimeMode);
  }
  return { selection, setSelection, mode, changeSettings };
}
