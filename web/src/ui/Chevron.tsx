import { Icon } from "./Icon.tsx";

interface Props {
  open: boolean;
  /** For a block that grows upward: points down when closed, up when open. */
  opensUp?: boolean;
  className?: string;
}

/** Disclosure arrow: right when closed and down when open; with `opensUp`, down and up. */
export function Chevron({ open, opensUp = false, className }: Props) {
  return <Icon name="chevron" className={["icon disclosure", opensUp && "up", open && "open", className].filter(Boolean).join(" ")} />;
}
