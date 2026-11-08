import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DiffFile, DiffHunk } from "../../../../shared/diff.ts";
import { Button, Chevron, Icon, IconButton, Pressable } from "../../ui/index.ts";
import { isOpen, openByDefault, setAll, setTests, toolbarOf, type Overrides } from "./diffView.ts";
import { highlightLines, languageOf } from "./highlight.tsx";

const MARK = { add: "+", del: "-", context: " " } as const;

// Old side (context + del) and new side (context + add) are highlighted as two blocks, then mapped back per line.
export function HunkRows({ hunk, lang }: { hunk: DiffHunk; lang: string | undefined }) {
  const rows = useMemo(() => {
    const oldText: string[] = [];
    const newText: string[] = [];
    // Index of each line within the block of the side it is shown from.
    const pos = hunk.lines.map((line) => {
      if (line.kind !== "add") oldText.push(line.text);
      if (line.kind !== "del") newText.push(line.text);
      return (line.kind === "del" ? oldText : newText).length - 1;
    });
    const oldHl = highlightLines(oldText.join("\n"), lang);
    const newHl = highlightLines(newText.join("\n"), lang);
    return hunk.lines.map((line, i) => (line.kind === "del" ? oldHl[pos[i]!] : newHl[pos[i]!]));
  }, [hunk, lang]);
  return (
    <>
      <tr className="pr-diff-hunk">
        <td colSpan={4}>{hunk.header}</td>
      </tr>
      {hunk.lines.map((line, i) => (
        <tr key={i} className={`pr-diff-line ${line.kind}`}>
          <td className="pr-diff-no">{line.oldNo ?? ""}</td>
          <td className="pr-diff-no">{line.newNo ?? ""}</td>
          <td className="pr-diff-mark">{MARK[line.kind]}</td>
          <td className="pr-diff-code">
            {rows[i]}
            {line.noNewline && <span className="pr-diff-note">No newline at end of file</span>}
          </td>
        </tr>
      ))}
    </>
  );
}

// Line height of the diff table: the placeholder keeps the scroll height before the file renders.
const LINE_PX = 20;
const MARGIN_PX = 1500;

// Renders its children only once near the viewport, then keeps them: a big diff paints in slices.
function WhenVisible({ lines, children }: { lines: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  // Layout effect: files already near the screen render before the first paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < innerHeight + MARGIN_PX && rect.bottom > -MARGIN_PX) return setSeen(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setSeen(true);
        observer.disconnect();
      },
      { rootMargin: `${MARGIN_PX}px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return seen ? children : <div ref={ref} style={{ height: lines * LINE_PX }} />;
}

// The folder in muted text, the file name in full colour: the eye finds the file first.
function FilePath({ path }: { path: string }) {
  const cut = path.lastIndexOf("/") + 1;
  return (
    <span className="pr-diff-path">
      <span className="dir">{path.slice(0, cut)}</span>
      <span className="name">{path.slice(cut)}</span>
    </span>
  );
}

export function Counts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="pr-diff-counts">
      <span className="add">+{additions}</span> <span className="del">-{deletions}</span>
    </span>
  );
}

const FileDiff = memo(function FileDiff({ file, open, onToggle }: { file: DiffFile; open: boolean; onToggle: (path: string, open: boolean) => void }) {
  const lang = useMemo(() => languageOf(file.path), [file.path]);
  const renamed = file.oldPath !== "" && file.newPath !== "" && file.oldPath !== file.newPath;
  return (
    <section className="pr-diff-file" data-pr-diff-file>
      <Pressable className={`pr-diff-file-head${open ? " open" : ""}`} aria-expanded={open} onClick={() => onToggle(file.path, open)}>
        <Chevron open={open} />
        <FilePath path={renamed ? `${file.oldPath} → ${file.newPath}` : file.path} />
        <span className={`pr-diff-status ${file.status}`}>{file.status}</span>
        <Counts additions={file.additions} deletions={file.deletions} />
      </Pressable>
      {open &&
        (file.binary ? (
          <p className="pr-diff-empty">Binary file</p>
        ) : file.truncated ? (
          <p className="pr-diff-empty">Large diff hidden ({file.additions + file.deletions} changed lines)</p>
        ) : file.hunks.length === 0 ? (
          <p className="pr-diff-empty">{file.oldMode && file.newMode ? `Mode changed ${file.oldMode} → ${file.newMode}` : "No content changes"}</p>
        ) : (
          <WhenVisible lines={file.hunks.reduce((n, hunk) => n + hunk.lines.length + 1, 0)}>
            <div className="pr-diff-scroll">
              <table className="pr-diff-table">
                <tbody>
                  {file.hunks.map((hunk, i) => (
                    <HunkRows key={i} hunk={hunk} lang={lang} />
                  ))}
                </tbody>
              </table>
            </div>
          </WhenVisible>
        ))}
    </section>
  );
});

interface Props {
  files: DiffFile[];
  truncated: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

/** The changed files as collapsible blocks, with the controls to collapse all or the test files. */
export function DiffFiles({ files, truncated, refreshing, onRefresh }: Props) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const defaults = useMemo(() => openByDefault(files), [files]);
  const open = (path: string) => isOpen(overrides, defaults, path);
  const { hasTests, anyOpen, testsOpen } = toolbarOf(files, open);
  const toggle = useCallback((path: string, wasOpen: boolean) => setOverrides((o) => ({ ...o, [path]: !wasOpen })), []);

  return (
    <div className="pr-diff">
      <div className="pr-diff-bar">
        {files.length > 0 && (
          <Button size="sm" onClick={() => setOverrides(setAll(files, !anyOpen))}>
            <Icon name={anyOpen ? "chevronsDownUp" : "chevronsUpDown"} /> {anyOpen ? "Collapse all" : "Expand all"}
          </Button>
        )}
        {hasTests && (
          <Button size="sm" onClick={() => setOverrides((o) => setTests(o, files, !testsOpen))}>
            <Icon name={testsOpen ? "flaskConicalOff" : "flaskConical"} /> {testsOpen ? "Collapse tests" : "Expand tests"}
          </Button>
        )}
        <IconButton size="sm" variant="ghost" label="Refresh the diff" tooltip="Refresh the diff" disabled={refreshing} onClick={onRefresh}>
          <Icon name="refresh" />
        </IconButton>
      </div>
      {truncated && <p className="pr-diff-empty">The diff is too large: the last files are not shown.</p>}
      {files.length === 0 && !truncated && <p className="pr-diff-empty">No changes in this pull request.</p>}
      <div className="pr-diff-files">
        {files.map((file) => (
          <FileDiff key={file.path} file={file} open={open(file.path)} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
