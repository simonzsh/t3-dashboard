/** A folder (item null) or a file of a path tree. */
export interface PathNode<T> {
  /** Unique key: the folder path, or the key of the item. */
  key: string;
  name: string;
  item: T | null;
  children: PathNode<T>[];
}

/** Items grouped by folder, in first-seen order. A folder whose only child is a folder merges with it ("web/src"). */
export function pathTree<T>(items: readonly T[], partsOf: (item: T) => string[], keyOf: (item: T) => string): PathNode<T>[] {
  const roots: PathNode<T>[] = [];
  for (const item of items) {
    const parts = partsOf(item);
    let level = roots;
    let prefix = "";
    for (const part of parts.slice(0, -1)) {
      prefix = prefix ? `${prefix}/${part}` : part;
      let dir = level.find((n) => !n.item && n.key === prefix);
      if (!dir) level.push((dir = { key: prefix, name: part, item: null, children: [] }));
      level = dir.children;
    }
    level.push({ key: keyOf(item), name: parts[parts.length - 1] ?? "", item, children: [] });
  }
  return roots.map(compact);
}

function compact<T>(node: PathNode<T>): PathNode<T> {
  if (node.item) return node;
  let current = { ...node, children: node.children.map(compact) };
  while (current.children.length === 1 && !current.children[0]!.item) {
    const only = current.children[0]!;
    current = { ...only, name: `${current.name}/${only.name}` };
  }
  return current;
}

/** The items in the order the tree shows them, top to bottom. */
export function leavesOf<T>(nodes: readonly PathNode<T>[]): T[] {
  return nodes.flatMap((node) => (node.item ? [node.item] : leavesOf(node.children)));
}
