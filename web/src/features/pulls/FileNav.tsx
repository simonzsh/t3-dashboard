import { useEffect, useMemo, useRef } from "react";
import type { DiffFile } from "../../../../shared/diff.ts";
import { pathTree, Tree, type PathNode } from "../../ui/index.ts";
import { Counts } from "./DiffFiles.tsx";
import { isTestFile } from "./testFiles.ts";

interface Props {
  files: DiffFile[];
  open: (path: string) => boolean;
  /** Path of the file under the top of the diff. */
  active: string | null;
  onPick: (path: string) => void;
}

/** The changed files as a folder tree: a click scrolls the diff to the file. A collapsed test file is dimmed. */
export function FileNav({ files, open, active, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const nodes = useMemo(() => pathTree(files, (file) => file.path.split("/"), (file) => file.path), [files]);
  const tests = useMemo(() => new Set(files.filter((file) => isTestFile(file.path)).map((file) => file.path)), [files]);

  // Keep the current row in view inside the tree only: scrollIntoView would also move the diff.
  useEffect(() => {
    const el = box.current;
    const row = el?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!el || !row) return;
    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + row.offsetHeight - el.clientHeight;
  }, [active]);

  return (
    <nav className="pulls-file-nav" aria-label="Changed files">
      <h3 className="pulls-panel-title">
        Files <span className="pulls-file-count">{files.length}</span>
      </h3>
      <div ref={box} className="pulls-file-tree">
        <Tree<DiffFile, PathNode<DiffFile>>
          nodes={nodes}
          active={active}
          onPick={(file) => onPick(file.path)}
          icon={(file) => (tests.has(file.path) ? "flaskConical" : "fileText")}
          rowClass={(file) => (tests.has(file.path) && !open(file.path) ? "dim" : "")}
          rowLabel={(file) => `${file.path}${tests.has(file.path) ? " (test)" : ""}`}
          extra={(node) => node.item && <Counts additions={node.item.additions} deletions={node.item.deletions} />}
        />
      </div>
    </nav>
  );
}
