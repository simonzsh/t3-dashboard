import type { ButtonHTMLAttributes, Ref } from "react";

// A clickable surface with its own look (card, row, tab, swatch): no variant, no fixed height.
export function Pressable({ type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  return <button type={type} {...rest} />;
}
