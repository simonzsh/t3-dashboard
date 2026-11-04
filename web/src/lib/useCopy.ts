import { useEffect, useState } from "react";
import { copyText } from "./clipboard.ts";
import { useAction } from "./useAction.ts";

const COPIED_MS = 1500;

/** Copies a text; `copied` stays true for a moment, so a button can show a check. */
export function useCopy(what: string) {
  const [copied, setCopied] = useState(false);
  const action = useAction(what);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return { copied, copy: (text: string) => void action.run(() => copyText(text)).then((ok) => ok && setCopied(true)) };
}
