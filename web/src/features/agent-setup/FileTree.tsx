import { useState } from "react";
import { Badge, Chevron, Icon, Pressable } from "../../ui/index.ts";
import { SEVERITY_VARIANT } from "./IssueList.tsx";
import type { TreeNode } from "./setupTree.ts";

function IssueBadge({ node }: { node: TreeNode }) {
  if (!node.worst) return null;
  return <Badge variant={SEVERITY_VARIANT[node.worst]}>{node.issues}</Badge>;
}

function Rows({ nodes, picked, onPick, closed, onToggle, depth }: Props & { nodes: TreeNode[]; closed: Set<string>; onToggle: (key: string) => void; depth: number }) {
  return (
    <ul className="as-tree">
      {nodes.map((node) => {
        const open = !closed.has(node.key);
        return (
          <li key={node.key}>
            <Pressable
              className={`as-node${node.file?.id === picked ? " active" : ""}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              aria-expanded={node.file ? undefined : open}
              aria-current={node.file?.id === picked ? "true" : undefined}
              onClick={() => (node.file ? onPick(node.file.id) : onToggle(node.key))}
            >
              {node.file ? <Icon name="fileText" /> : <Chevron open={open} />}
              <span className="as-node-name" data-tooltip={node.name} data-tooltip-clipped>
                {node.name}
              </span>
              <IssueBadge node={node} />
            </Pressable>
            {!node.file && open && <Rows nodes={node.children} picked={picked} onPick={onPick} closed={closed} onToggle={onToggle} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  nodes?: TreeNode[];
  picked: string | null;
  onPick: (fileId: string) => void;
}

/** Folders and files of one scope. Folders open and close; a file opens in the detail. */
export function FileTree({ nodes = [], picked, onPick }: Props) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return <Rows nodes={nodes} picked={picked} onPick={onPick} closed={closed} onToggle={toggle} depth={0} />;
}
