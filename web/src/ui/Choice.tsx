import type { InputHTMLAttributes, Ref } from "react";

// Checkbox or radio: the global accent-color paints it.
export function Choice({ type, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { type: "checkbox" | "radio"; ref?: Ref<HTMLInputElement> }) {
  return <input type={type} {...rest} />;
}
