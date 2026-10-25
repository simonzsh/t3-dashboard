import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Kbd } from "./Kbd.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ControlSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Keyboard shortcut shown after the label; hidden on touch and narrow screens. */
  kbd?: string;
  /** Disables the button; a string also replaces the label while it is true. */
  loading?: boolean | string;
  ref?: Ref<HTMLButtonElement>;
}

export function buttonClass(base: string, size: ControlSize, variant: ButtonVariant, className = ""): string {
  return [base, size, variant === "secondary" ? "" : variant, className].filter(Boolean).join(" ");
}

export function Button({ variant = "secondary", size = "md", kbd, loading = false, className, type = "button", disabled, children, ...rest }: ButtonProps) {
  const busy = loading !== false;
  const label: ReactNode = typeof loading === "string" ? loading : children;
  return (
    <button {...rest} type={type} className={buttonClass("btn", size, variant, className)} disabled={disabled || busy} aria-busy={busy || undefined}>
      {label}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}
