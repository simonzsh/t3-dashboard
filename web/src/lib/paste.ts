export interface TextField {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  setRangeText(text: string, start: number, end: number, mode: "end"): void;
}

// Chrome sometimes drops a native paste after `beforeinput` (seen with Wispr Flow on the Desk).
// Insert the text ourselves: execCommand keeps Cmd+Z, the direct edit is the fallback.
export function insertText(field: TextField, text: string, exec: (text: string) => boolean = (t) => document.execCommand("insertText", false, t)): string {
  const before = field.value;
  if (exec(text) && field.value !== before) return field.value;
  const start = field.selectionStart ?? before.length;
  field.setRangeText(text, start, field.selectionEnd ?? start, "end");
  return field.value;
}
