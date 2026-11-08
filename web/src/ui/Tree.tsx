import { useState, type ReactNode } from "react";
import type { PathNode } from "./pathTree.ts";
import { Chevron } from "./Chevron.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { Pressable } from "./Pressable.tsx";

export interface TreeProps<T, N extends PathNode<T>> {
  nodes: N[];
  /** Key of the current file: it is marked with aria-current. */
  active?: string | null;
  onPick: (item: T) => void;
  /** The file icon; a file row has no chevron. */
  icon?: (item: T) => IconName;
  /** Shown at the end of any row: counts, a badge. */
  extra?: (node: N) => ReactNode;
  /** Extra classes on a file row. */
  rowClass?: (item: T) => string;
  /** Accessible name of a file row, when the name alone says too little. */
  rowLabel?: (item: T) => string;
}

// Indent per level, in px: the chevron and the file icon line up under the parent name.
const INDENT = 14;

/** Folders that open and close, and files to pick. Folders start open. */
export function Tree<T, N extends PathNode<T>>(props: TreeProps<T, N>) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return <Rows {...props} closed={closed} onToggle={toggle} depth={0} />;
}

function Rows<T, N extends PathNode<T>>({ nodes, closed, onToggle, depth, ...props }: TreeProps<T, N> & { closed: ReadonlySet<string>; onToggle: (key: string) => void; depth: number }) {
  const { active, onPick, icon, extra, rowClass, rowLabel } = props;
  return (
    <ul className="ui-tree">
      {nodes.map((node) => {
        const { item } = node;
        const open = !closed.has(node.key);
        const current = item !== null && node.key === active;
        const classes = ["ui-tree-row", current && "active", item !== null && rowClass?.(item)].filter(Boolean).join(" ");
        return (
          <li key={node.key}>
            <Pressable
              className={classes}
              style={{ paddingLeft: 8 + depth * INDENT }}
              aria-expanded={item === null ? open : undefined}
              aria-current={current ? "true" : undefined}
              aria-label={item !== null ? rowLabel?.(item) : undefined}
              onClick={() => (item !== null ? onPick(item) : onToggle(node.key))}
            >
              {item !== null ? <Icon name={icon?.(item) ?? "fileText"} /> : <Chevron open={open} />}
              <span className="ui-tree-name" data-tooltip={node.name} data-tooltip-clipped>
                {node.name}
              </span>
              {extra?.(node)}
            </Pressable>
            {item === null && open && <Rows {...props} nodes={node.children as N[]} closed={closed} onToggle={onToggle} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
