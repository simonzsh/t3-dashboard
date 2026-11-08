import type { SetupFile } from "../../../../shared/api.ts";
import { Badge, Tree } from "../../ui/index.ts";
import { SEVERITY_VARIANT } from "./IssueList.tsx";
import type { TreeNode } from "./setupTree.ts";

function IssueBadge({ node }: { node: TreeNode }) {
  if (!node.worst) return null;
  return <Badge variant={SEVERITY_VARIANT[node.worst]}>{node.issues}</Badge>;
}

interface Props {
  nodes?: TreeNode[];
  picked: string | null;
  onPick: (fileId: string) => void;
}

/** Folders and files of one scope. Folders open and close; a file opens in the detail. */
export function FileTree({ nodes = [], picked, onPick }: Props) {
  return <Tree<SetupFile, TreeNode> nodes={nodes} active={picked} onPick={(file) => onPick(file.id)} extra={(node) => <IssueBadge node={node} />} />;
}
