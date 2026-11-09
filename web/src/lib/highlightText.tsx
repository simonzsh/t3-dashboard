import { cloneElement, isValidElement, type ReactNode } from "react";

/** Mark literal matches without changing links, code blocks, or their attributes. */
export function highlightText(node: ReactNode, query: string): ReactNode {
  const term = query.trim();
  if (!term) return node;
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  return highlightNode(node, pattern);
}

function highlightNode(node: ReactNode, pattern: RegExp): ReactNode {
  if (typeof node === "string") {
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
  if (Array.isArray(node)) return node.map((child) => highlightNode(child, pattern));
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, {}, highlightNode(node.props.children, pattern));
  }
  return node;
}
