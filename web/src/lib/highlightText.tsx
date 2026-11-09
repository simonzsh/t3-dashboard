import { cloneElement, isValidElement, type ReactNode } from "react";

/** Mark literal matches without changing links, code blocks, or their attributes. */
export function highlightText(node: ReactNode, query: string): ReactNode {
  const term = query.trim();
  if (!term) return node;
  if (typeof node === "string") {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    const parts: ReactNode[] = [];
    let end = 0;
    for (const match of node.matchAll(pattern)) {
      parts.push(node.slice(end, match.index));
      parts.push(<mark className="search-highlight" key={match.index}>{match[0]}</mark>);
      end = match.index + match[0].length;
    }
    parts.push(node.slice(end));
    return parts;
  }
  if (Array.isArray(node)) return node.map((child) => highlightText(child, term));
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, {}, highlightText(node.props.children, term));
  }
  return node;
}
