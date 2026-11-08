import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { buttonClass, type ButtonVariant, type ControlSize } from "./Button.tsx";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ControlSize;
  tooltip?: string;
  ref?: Ref<HTMLAnchorElement>;
}

/** A link that looks like a Button. */
export function ButtonLink({ variant = "secondary", size = "md", tooltip, className, ...rest }: LinkProps) {
  return <a {...rest} data-tooltip={tooltip} className={buttonClass("btn", size, variant, className)} />;
}

interface IconLinkProps extends Omit<LinkProps, "aria-label"> {
  /** Accessible name. */
  label: string;
  children: ReactNode;
}

/** A link that looks like an IconButton. */
export function IconButtonLink({ label, variant = "secondary", size = "md", tooltip, className, children, ...rest }: IconLinkProps) {
  return (
    <a {...rest} aria-label={label} data-tooltip={tooltip} className={buttonClass("icon-button", size, variant, className)}>
      {children}
    </a>
  );
}
