interface Env {
  clipboard: { writeText(text: string): Promise<void> } | undefined;
  execCopy: (text: string) => boolean;
}

// The legacy path covers plain http (a tailnet address), where navigator.clipboard does not exist.
function execCopy(text: string): boolean {
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } finally {
    field.remove();
    previous?.focus?.();
  }
}

export async function copyText(text: string, env: Env = { clipboard: navigator.clipboard, execCopy }): Promise<void> {
  try {
    if (env.clipboard) return await env.clipboard.writeText(text);
  } catch {
    // Refused (permission, focus): try the legacy path.
  }
  if (!env.execCopy(text)) throw new Error("The browser refused to copy.");
}
