import type { HTMLAttributes, ReactNode } from "react";

interface Props extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Search, filters and actions: they stay put while the body scrolls. */
  head: ReactNode;
  headClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
}

const join = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

// The head sits outside the scroll box, so it never moves. A sticky head inside the box shifts by its padding.
export function ListPage({ head, headClassName, bodyClassName, className, children, ...rest }: Props) {
  return (
    <section className={join("list-page", className)} {...rest}>
      <div className={join("list-page-head", headClassName)}>{head}</div>
      <div className={join("list-page-body page-scroll", bodyClassName)}>{children}</div>
    </section>
  );
}
