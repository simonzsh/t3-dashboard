import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DiffFile, DiffHunk } from "../../../../shared/diff.ts";
import { Button, Chevron, Pressable } from "../../ui/index.ts";
import { canLoad, isLarge, isOpen, loadLabel, nearViewport, openByDefault, setAll, setTests, shouldHighlight, toolbarOf, type Overrides } from "./diffView.ts";
import { useHighlighter, type Highlighter } from "./highlighter.ts";
import { languageOf } from "./language.ts";

const MARK = { add: "+", del: "-", context: " " } as const;

// Plain text until the highlighter chunk arrives, then coloured.
export function HunkRows({ hunk, lang, hl }: { hunk: DiffHunk; lang: string | undefined; hl: Highlighter | null }) {
  const rows = useMemo<ReactNode[]>(() => (hl && lang ? hl.highlightHunk(hunk, lang) : hunk.lines.map((line) => line.text)), [hl, hunk, lang]);
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
    if (nearViewport(el.getClientRects().length > 0, el.getBoundingClientRect(), innerHeight, MARGIN_PX)) return setSeen(true);
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
  const lang = useMemo(() => (shouldHighlight(file) ? languageOf(file.path) : undefined), [file]);
  const hl = useHighlighter(open && lang !== undefined);
  const renamed = file.oldPath !== "" && file.newPath !== "" && file.oldPath !== file.newPath;
  return (
    <section className="pr-diff-file" data-pr-diff-file={file.path}>
      <Pressable className={`pr-diff-file-head${open ? " open" : ""}`} aria-expanded={open} onClick={() => onToggle(file.path, open)}>
        <Chevron open={open} />
        <FilePath path={renamed ? `${file.oldPath} → ${file.newPath}` : file.path} />
        <span className={`pr-diff-status ${file.status}`}>{file.status}</span>
        <Counts additions={file.additions} deletions={file.deletions} />
      </Pressable>
      {!open && isLarge(file) && canLoad(file) && (
        <div className="pr-diff-load">
          <Button size="sm" onClick={() => onToggle(file.path, false)}>
            {loadLabel(file)}
          </Button>
        </div>
      )}
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
                    <HunkRows key={i} hunk={hunk} lang={lang} hl={hl} />
                  ))}
                </tbody>
              </table>
            </div>
          </WhenVisible>
        ))}
    </section>
  );
});

/** Which files are open, and the actions of the header that collapse them. */
export function useDiffView(files: DiffFile[], headSha: string) {
  // Choices reset when a refresh brings a new head commit, without a remount that would lose the scroll.
  const [state, setState] = useState<{ sha: string; overrides: Overrides }>({ sha: headSha, overrides: {} });
  const overrides = state.sha === headSha ? state.overrides : {};
  const update = useCallback((next: (o: Overrides) => Overrides) => setState((s) => ({ sha: headSha, overrides: next(s.sha === headSha ? s.overrides : {}) })), [headSha]);
  const defaults = useMemo(() => openByDefault(files), [files]);
  const open = useCallback((path: string) => isOpen(overrides, defaults, path), [overrides, defaults]);
  const bar = useMemo(() => toolbarOf(files, open), [files, open]);
  return {
    open,
    ...bar,
    toggle: useCallback((path: string, wasOpen: boolean) => update((o) => ({ ...o, [path]: !wasOpen })), [update]),
    toggleAll: () => update(() => setAll(files, !bar.anyOpen)),
    toggleTests: () => update((o) => setTests(o, files, !bar.testsOpen)),
  };
}

interface Props {
  files: DiffFile[];
  truncated: boolean;
  open: (path: string) => boolean;
  onToggle: (path: string, wasOpen: boolean) => void;
}

/** The changed files as collapsible blocks; the header holds the collapse controls. */
export function DiffFiles({ files, truncated, open, onToggle }: Props) {
  return (
    <div className="pr-diff">
      {truncated && <p className="pr-diff-empty">The diff is too large: the last files are not shown.</p>}
      {files.length === 0 && !truncated && <p className="pr-diff-empty">No changes in this pull request.</p>}
      <div className="pr-diff-files">
        {files.map((file) => (
          <FileDiff key={file.path} file={file} open={open(file.path)} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}
