import { useEffect, useRef, useState } from "react";
import type { NewsArticle, NewsState } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { renderMarkdown } from "../../lib/markdown.tsx";
import { Button, Icon, Loader, Pressable } from "../../ui/index.ts";
import { dateLabel, shortDate, statusLine } from "./news.ts";

interface Props {
  news: NewsState;
  now: Date;
}

/** The article list and the open article. On a phone they take turns: the list, then the article with a back button. */
export function NewsView({ news, now }: Props) {
  const api = useApi();
  const { articles, task } = news;
  const [picked, setPicked] = useState<string | null>(null);
  // Phone only: the article covers the list. A wide screen shows both and ignores it.
  const [reading, setReading] = useState(false);
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Phone: the article is shown only now, so bring it to the top of the page.
  useEffect(() => {
    if (reading) articleRef.current?.scrollIntoView({ block: "start" });
  }, [reading, picked]);

  const status = <p className="news-status">{statusLine(task, now)}</p>;
  if (articles.length === 0) {
    return (
      <div className="news-page empty">
        <section className="news-list" aria-label="News">
          {status}
          <div className="empty-state">
            <Icon name="newspaper" />
            <strong>No news yet</strong>
            <span>{task ? "Your first article shows here after the next run. Use Run now to get one at once." : "Open News settings, pick your topics and save."}</span>
          </div>
        </section>
      </div>
    );
  }
  const shown = article?.date === date ? article : null;
  return (
    <div className={`news-page${reading ? " reading" : ""}`}>
      <section className="news-list" aria-label="News">
        {status}
        <ul className="news-items">
          {articles.map((a) => (
            <li key={a.date}>
              <Pressable
                className={`news-item${a.date === date ? " active" : ""}`}
                aria-current={a.date === date ? "true" : undefined}
                onClick={() => {
                  setPicked(a.date);
                  setReading(true);
                }}
              >
                <span className="news-item-date">{shortDate(a.date)}</span>
                <span className="news-item-title">{a.title}</span>
              </Pressable>
            </li>
          ))}
        </ul>
      </section>
      <article ref={articleRef} className="news-article" aria-label={shown?.title ?? "News"}>
        <Button variant="ghost" size="sm" className="news-back" onClick={() => setReading(false)}>
          <Icon name="arrowLeft" /> News
        </Button>
        {error ? (
          <p className="auto-error" role="alert">{error}</p>
        ) : shown ? (
          <>
            <p className="news-article-date">{dateLabel(shown.date)}</p>
            <div className="md news-body">{renderMarkdown(shown.markdown)}</div>
          </>
        ) : (
          <Loader />
        )}
      </article>
    </div>
  );
}
