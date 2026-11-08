import type { HTMLAttributes, ReactNode, Ref } from "react";

interface Props extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Search, filters and actions: they stay put while the body scrolls. */
  head: ReactNode;
  headClassName?: string;
  bodyClassName?: string;
  /** On a phone the body runs edge to edge, for content that needs the full width (a diff). */
  bleed?: boolean;
  /** The scroll box, for a view that follows or sets its scroll position. */
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

const join = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

// The head sits outside the scroll box, so it never moves. A sticky head inside the box shifts by its padding.
export function ListPage({ head, headClassName, bodyClassName, bodyRef, bleed = false, className, children, ...rest }: Props) {
  return (
    <section className={join("list-page", className)} {...rest}>
      <div className={join("list-page-head", headClassName)}>{head}</div>
      <div ref={bodyRef} className={join(bleed ? "list-page-body page-scroll bleed" : "list-page-body page-scroll", bodyClassName)}>{children}</div>
    </section>
  );
}
