import type { ButtonHTMLAttributes, Ref } from "react";

export interface PressableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
  shortcut?: string;
  ref?: Ref<HTMLButtonElement>;
}

// A clickable surface with its own look (card, row, tab, swatch): no variant, no fixed height.
export function Pressable({ type = "button", tooltip, shortcut, ...rest }: PressableProps) {
  return <button type={type} data-tooltip={tooltip} data-shortcut={tooltip ? shortcut : undefined} {...rest} />;
}
