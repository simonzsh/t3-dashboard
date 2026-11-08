import { useEffect, useRef, useState } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrDetail as Detail, PrDiff, PrRef } from "../../../../shared/pulls.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { Button, ListPage, Loader, PHONE, Sheet, SidePanel } from "../../ui/index.ts";
import { DiffFiles, useDiffView } from "./DiffFiles.tsx";
import { currentIndex } from "./diffView.ts";
import { FileNav } from "./FileNav.tsx";
import { PrHeader, PrMeta } from "./PrHeader.tsx";
import { usePullDetailPrefs } from "./prefs.ts";

// Below this width the file tree leaves the side and opens in a sheet.
const WIDE = "(min-width: 1100px)";
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
  const body = useRef<HTMLDivElement>(null);
  // At the end of the diff a short last file never reaches the reading line: keep the one the user picked.
  const picked = useRef<number | null>(null);

  // Follow the file under the top of the diff, once per frame.
  useEffect(() => {
    const box = body.current;
    if (!box || files.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const blocks = fileBlocks(box);
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

  function pick(path: string) {
    setSheet(false);
    const box = body.current;
    const index = files.findIndex((file) => file.path === path);
    const el = box && fileBlocks(box)[index];
    if (!box || !el) return;
    picked.current = index;
    box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top });
    setActive(index);
  }

  const nav = <FileNav files={files} open={view.open} active={files[active]?.path ?? null} onPick={pick} />;
  const controls = { ...view, hasFiles: files.length > 0 };
  return (
    <ListPage
      className="pulls-detail"
      aria-label="Pull request"
      bodyRef={body}
      bleed
      head={
        <PrHeader pr={pr} detail={detail} now={now} sessions={sessions} onOpenSession={onOpenSession} controls={controls} refreshing={refreshing} onRefresh={onRefresh} filesPanel={wide ? { hidden: !filesOpen, onToggle: () => setDetailPrefs({ filesOpen: !filesOpen }) } : undefined} onShowFiles={wide ? undefined : () => setSheet(true)} phone={phone} />
      }
    >
      <div className="pulls-detail-grid">
        {wide && files.length > 0 && (
          <SidePanel hidden={!filesOpen} className="pulls-detail-side">
            <aside className="pulls-detail-tree">{nav}</aside>
          </SidePanel>
        )}
        <div className="pulls-detail-main">
          {detail && phone && <PrMeta detail={detail} now={now} />}
          {detailError && <p className="auto-error" role="alert">{detailError}</p>}
          {diffError && (
            <div className="pulls-diff-error">
              <p className="auto-error" role="alert">{diffError}</p>
              <Button size="sm" variant="secondary" disabled={refreshing} onClick={onRefresh}>Retry</Button>
            </div>
          )}
          {diff ? <DiffFiles files={diff.files} truncated={diff.truncated} open={view.open} onToggle={view.toggle} /> : !diffError && <Loader />}
        </div>
      </div>
      {!wide && (
        <Sheet open={sheet} label="Changed files" onClose={() => setSheet(false)}>
          {nav}
        </Sheet>
      )}
    </ListPage>
  );
}
