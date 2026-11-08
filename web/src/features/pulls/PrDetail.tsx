import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrDetail as Detail, PrDiff, PrRef } from "../../../../shared/pulls.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { Button, ListPage, Loader, PHONE, Sheet, SidePanel, Tabs, WIDE, type TabOption } from "../../ui/index.ts";
import { DiffFiles, useDiffView } from "./DiffFiles.tsx";
import { currentIndex } from "./diffView.ts";
import { FileNav } from "./FileNav.tsx";
import { PrHeader, PrMeta } from "./PrHeader.tsx";
import { usePullDetailPrefs } from "./prefs.ts";

// The reading line sits a little below the top of the scroll box, so a file counts once its head is reached.
const READ_OFFSET = 12;

interface Props {
  pr: PrRef;
  detail: Detail | null;
  detailError: string | null;
  diff: PrDiff | null;
  diffError: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  now: Date;
  /** The sessions tied to this pull request. */
  sessions: DashboardThread[];
  onOpenSession: (id: string, addOnly: boolean) => void;
}

/** Description and Changes everywhere; a phone adds Files, as the file tree has no side column there. */
export type DetailTab = "description" | "changes" | "files";

export function tabsOf(phone: boolean, files: number): Array<TabOption<DetailTab>> {
  const tabs: Array<TabOption<DetailTab>> = [
    { id: "description", label: "Description", icon: "fileText" },
    { id: "changes", label: "Changes", icon: "gitPullRequest", count: files > 0 ? files : undefined },
  ];
  return phone ? [...tabs, { id: "files", label: "Files", icon: "listTree" }] : tabs;
}

const fileBlocks = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>("[data-pr-diff-file]")];

/** One pull request: a fixed header with its status and actions, its diff, and the list of its files. */
export function PrDetail({ pr, detail, detailError, diff, diffError, refreshing, onRefresh, now, sessions, onOpenSession }: Props) {
  const files = diff?.files ?? [];
  const view = useDiffView(files, diff?.headSha ?? "");
  const wide = useMediaQuery(WIDE);
  const phone = useMediaQuery(PHONE);
  const [sheet, setSheet] = useState(false);
  const [{ filesOpen }, setDetailPrefs] = usePullDetailPrefs();
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<DetailTab>("changes");
  // Files is a phone tab: on a wider screen the same choice shows the changes.
  const shown: DetailTab = tab === "files" && !phone ? "changes" : tab;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  // Each tab keeps its own scroll position in the shared scroll box.
  const scrolls = useRef<Partial<Record<DetailTab, number>>>({});
  const pendingPick = useRef<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  // At the end of the diff a short last file never reaches the reading line: keep the one the user picked.
  const picked = useRef<number | null>(null);

  // Follow the file under the top of the diff, once per frame.
  useEffect(() => {
    const box = body.current;
    if (!box || files.length === 0) return;
    // One section per file, kept for the life of this diff: read the list once, not on every frame.
    const blocks = fileBlocks(box);
    let frame = 0;
    const update = () => {
      frame = 0;
      // A hidden diff has no layout: only the Changes tab moves the current file.
      if (shownRef.current !== "changes") return;
      const atEnd = box.scrollTop > 0 && box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
      if (atEnd) return setActive(picked.current ?? blocks.length - 1);
      picked.current = null;
      setActive(currentIndex(blocks.map((el) => el.getBoundingClientRect().top), box.getBoundingClientRect().top + READ_OFFSET));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      box.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [files]);

  function switchTab(next: DetailTab) {
    if (body.current) scrolls.current[shown] = body.current.scrollTop;
    setTab(next);
  }

  // After a tab change: go to the file picked in the Files tab, else back where this tab was.
  useLayoutEffect(() => {
    const box = body.current;
    if (!box) return;
    const path = pendingPick.current;
    pendingPick.current = null;
    if (path && shown === "changes") pick(path);
    else box.scrollTop = scrolls.current[shown] ?? 0;
  }, [shown]);

  function pick(path: string) {
    setSheet(false);
    if (shown !== "changes") {
      pendingPick.current = path;
      return switchTab("changes");
    }
    const box = body.current;
    const index = files.findIndex((file) => file.path === path);
    const el = box && fileBlocks(box)[index];
    if (!box || !el) return;
    picked.current = index;
    box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top });
    setActive(index);
  }

  const description = useMemo(() => (detail && detail.body.trim() !== "" ? renderMarkdown(detail.body) : null), [detail?.body]);
  const tabs = <Tabs label="Pull request" idPrefix="pr-tab" value={shown} options={tabsOf(phone, files.length)} onChange={switchTab} variant="underline" className="pulls-tabs" />;
  const nav = <FileNav files={files} open={view.open} active={files[active]?.path ?? null} onPick={pick} />;
  // The diff actions only act on the Changes tab (and the Files tab, its list on a phone).
  const diffShown = shown !== "description";
  const controls = { ...view, hasFiles: diffShown && files.length > 0, hasTests: diffShown && view.hasTests };
  return (
    <ListPage
      className="pulls-detail"
      aria-label="Pull request"
      bodyRef={body}
      bleed
      flush
      head={
        <PrHeader pr={pr} detail={detail} now={now} sessions={sessions} onOpenSession={onOpenSession} controls={controls} refreshing={refreshing} onRefresh={onRefresh} filesPanel={wide ? { hidden: !filesOpen, onToggle: () => setDetailPrefs({ filesOpen: !filesOpen }) } : undefined} onShowFiles={wide || phone ? undefined : () => setSheet(true)} phone={phone} tabs={phone ? undefined : tabs} />
      }
    >
      {/* On a phone the head stays one line: the meta line and the tabs scroll with the page, in the desktop order. */}
      {phone && (
        <div className="pulls-phone-top">
          {detail && <PrMeta detail={detail} now={now} />}
          {tabs}
        </div>
      )}
      <div className="pulls-detail-grid">
        {wide && files.length > 0 && shown === "changes" && (
          <SidePanel hidden={!filesOpen} className="pulls-detail-side">
            <aside className="pulls-detail-tree">{nav}</aside>
          </SidePanel>
        )}
        <div className="pulls-detail-main" role="tabpanel" id="pr-tab-panel" aria-labelledby={`pr-tab-${shown}`}>
          {detailError && <p className="auto-error" role="alert">{detailError}</p>}
          <div className="pulls-description" hidden={shown !== "description"}>
            {!detail ? !detailError && <Loader /> : description ? <div className="md">{description}</div> : <p className="pulls-panel-empty">No description.</p>}
          </div>
          {/* The diff stays mounted while hidden: its open files and highlighting are kept. */}
          <div className="pulls-changes" hidden={shown !== "changes"}>
            {diffError && (
              <div className="pulls-diff-error">
                <p className="auto-error" role="alert">{diffError}</p>
                <Button size="sm" variant="secondary" disabled={refreshing} onClick={onRefresh}>Retry</Button>
              </div>
            )}
            {diff ? <DiffFiles files={diff.files} truncated={diff.truncated} open={view.open} onToggle={view.toggle} /> : !diffError && <Loader />}
          </div>
          {phone && shown === "files" && <div className="pulls-files-tab">{nav}</div>}
        </div>
      </div>
      {!wide && !phone && (
        <Sheet open={sheet} label="Changed files" onClose={() => setSheet(false)}>
          {nav}
        </Sheet>
      )}
    </ListPage>
  );
}
