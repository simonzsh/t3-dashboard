/** The window of a session in the strip, when it is on screen. */
export const sessionWindowEl = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-session-window="${CSS.escape(id)}"]`);

/** Puts the caret at the end of the message field of a session; false when it has no usable field. */
export function focusSessionField(id: string): boolean {
  const field = sessionWindowEl(id)?.querySelector("textarea");
  if (!field || field.disabled) return false;
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
  return true;
}
