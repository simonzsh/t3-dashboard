import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { NewsArticle, NewsArticleSummary, NewsState } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { Button, Icon, IconButton, Loader, Pressable, TextInput } from "../../ui/index.ts";
import { DeleteNewsDialog } from "./DeleteNewsDialog.tsx";
import { dateLabel, filterArticles, isUnreadArticle, readTarget, SEARCH_DEBOUNCE_MS, shortDate, statusLine } from "./news.ts";

interface Props {
  news: NewsState;
  /** An article is being written, or Run now was just pressed. */
  writing: boolean;
  now: Date;
  /** Wide screen: the article list is hidden from the header and the article takes the width. */
  listHidden?: boolean;
  /** Phone layout: the list and the article take turns. */
  compact: boolean;
  /** Read marks shared with the notifications; null until loaded (then no dot shows). */
  seen: SeenState | null;
  /** Called when an article is in front of the user. */
  onRead: (mark: { id: string; at: string }) => void;
  /** Opens a thread in Sessions; `addOnly` adds it next to the open ones. */
  onOpenThread: (id: string, addOnly: boolean) => void;
  /** Delete one article, or all of them. They throw when the server refuses. */
  onDelete: (date: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

/** The article list and the open article. On a phone they take turns: the list, then the article with a back button. */
export function NewsView({ news, writing, now, compact, listHidden = false, seen, onRead, onOpenThread, onDelete, onDeleteAll }: Props) {
  const api = useApi();
  const { articles, task, running } = news;
  const [picked, setPicked] = useState<string | null>(null);
  // Phone only: the article covers the list. A wide screen shows both and ignores it.
  const [reading, setReading] = useState(false);
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  // The open item's box, for the highlight that slides between items like the sidebar's.
  const listRef = useRef<HTMLUListElement>(null);
  const [highlight, setHighlight] = useState<{ top: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The delete dialog: one article, or "all".
  const [deleting, setDeleting] = useState<NewsArticleSummary | "all" | null>(null);
  // The search box, its debounced text, and the dates the server found for the last answered text.
  const [query, setQuery] = useState("");
  const term = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const [matches, setMatches] = useState<string[] | null>(null);
  const date = (articles.some((a) => a.date === picked) ? picked : articles[0]?.date) ?? null;
  // A second run on the same day rewrites that day's file: a new mtime reloads it.
  const mtimeMs = articles.find((a) => a.date === date)?.mtimeMs ?? null;

  useEffect(() => {
    if (!date) return;
    let stale = false;
    setError(null);
    api.getNewsArticle(date).then(
      (a) => !stale && setArticle(a),
      (e: unknown) => !stale && setError(failure("load the article", e)),
    );
    return () => {
      stale = true;
    };
  }, [date, mtimeMs]);

  // A new run or a delete changes the files: search again.
  const files = articles.map((a) => `${a.date}:${a.mtimeMs}`).join();
  useEffect(() => {
    if (!term) return setMatches(null);
    let stale = false;
    api.searchNews(term).then(
      (r) => !stale && setMatches(r.dates),
      // A failed search keeps the last list: the error banner belongs to the open article.
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [term, files]);
  const searching = term !== "" && matches !== null;
  const visible = searching ? filterArticles(articles, matches) : articles;

  // The article in front of the user is read: on a click, on the auto-selected newest one, and after a re-run.
  const mark = readTarget(articles, date, compact && !reading);
  useEffect(() => {
    if (mark) onRead(mark);
  }, [mark?.id, mark?.at, onRead]);

  // Phone: the article is shown only now, so bring it to the top of the page.
  useEffect(() => {
    if (reading) articleRef.current?.scrollIntoView({ block: "start" });
  }, [reading, picked]);

  // The new article is shown when the run ends, even if an older one was picked.
  const wasWriting = useRef(false);
  useEffect(() => {
    if (wasWriting.current && !writing) setPicked(null);
    wasWriting.current = writing;
  }, [writing]);

  const body = useMemo(() => (article ? renderMarkdown(article.markdown) : null), [article?.markdown]);
  const line = statusLine(task, now);
  const status = line ? <p className="news-status">{line}</p> : null;
  const progress = writing && (
    <li className="news-item writing">
      <Loader inline label="Writing the article" />
      <span className="news-item-title">Writing the article…</span>
      {running?.threadId && (
        <Button size="sm" variant="link" onClick={(e) => onOpenThread(running.threadId!, e.shiftKey)}>
          Open session
        </Button>
      )}
    </li>
  );
  // Dates and file times, not the array: it is new on every render.
  const visibleKey = visible.map((a) => a.date + a.mtimeMs).join();
  // Before any early return: a hook skipped on some renders breaks React (empty list after Delete all).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || compact) return setHighlight(null);
    const measure = () => {
      const item = list.querySelector<HTMLElement>(".news-item.active");
      // Measure against the list, not offsetTop: each row is its own positioned box (for its hover actions).
      const box = item?.getBoundingClientRect();
      setHighlight(box ? { top: box.top - list.getBoundingClientRect().top, height: box.height } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [date, compact, visibleKey, writing]);

  if (articles.length === 0) {
    return (
      <div className="news-page empty">
        <section className="news-list" aria-label="News">
          {status}
          {progress && <ul className="news-items">{progress}</ul>}
          <div className="empty-state">
            <Icon name="newspaper" />
            <strong>No news yet</strong>
            <span>{task ? "Your first article shows here after the next run. Use Run now to get one at once." : "Use Run now to get the first article. News settings sets when the next ones come."}</span>
          </div>
        </section>
      </div>
    );
  }
  const shown = article?.date === date ? article : null;
  return (
    <div className={`news-page${reading ? " reading" : ""}${listHidden && !compact ? " list-hidden" : ""}`}>
      {/* Kept mounted so hiding slides like the Sessions list; inert while hidden. */}
      <div className="news-list-slot" inert={listHidden && !compact}>
        <section className="news-list" aria-label="News">
          {status}
          <div className="news-tools">
            <div className="auto-search">
              <Icon name="search" />
              <TextInput aria-label="Search news" placeholder="Search news…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDeleting("all")}>
              <Icon name="trash" /> Delete all
            </Button>
          </div>
          <ul
            ref={listRef}
            className={`news-items${highlight ? " marked" : ""}`}
            style={highlight ? ({ "--mark-top": `${highlight.top}px`, "--mark-height": `${highlight.height}px` } as CSSProperties) : undefined}
          >
            {progress}
            {searching && visible.length === 0 && <li className="news-none">No matching articles</li>}
            {visible.map((a) => {
              // On a phone the list and the article take turns: no item is "open" while the list shows.
              const open = a.date === date && !compact;
              return (
                <li key={a.date} className="news-row">
                  <Pressable
                    className={`news-item${open ? " active" : ""}`}
                    aria-current={open ? "true" : undefined}
                    onClick={() => {
                      setPicked(a.date);
                      setReading(true);
                    }}
                  >
                    <span className="news-item-body">
                      <span className="news-item-date">{shortDate(a.date)}</span>
                      <span className="news-item-title">{a.title}</span>
                    </span>
                    {seen && isUnreadArticle(a, seen) && <span className="notif-dot" aria-label="Unread" role="img" />}
                  </Pressable>
                  <span className="thread-actions">
                    <IconButton label="Delete article" tooltip="Delete article" size="sm" variant="ghost" onClick={() => setDeleting(a)}>
                      <Icon name="trash" />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <article ref={articleRef} className="news-article" aria-label={shown?.title ?? "News"}>
        <Button variant="ghost" size="sm" className="news-back" onClick={() => setReading(false)}>
          <Icon name="arrowLeft" /> News
        </Button>
        {error ? (
          <p className="auto-error" role="alert">{error}</p>
        ) : shown ? (
          <>
            <p className="news-article-date">{dateLabel(shown.date)}</p>
            <div className="md news-body">{body}</div>
          </>
        ) : (
          <Loader />
        )}
      </article>
      {deleting && (
        <DeleteNewsDialog
          article={deleting === "all" ? null : deleting}
          count={articles.length}
          filtered={searching}
          onConfirm={deleting === "all" ? onDeleteAll : () => onDelete(deleting.date)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
