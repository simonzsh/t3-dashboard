import { marked, type Token, type Tokens } from "marked";
import { Fragment, type ReactNode } from "react";
import { Choice } from "../ui/index.ts";

// marked is only the lexer: tokens become React elements, so raw HTML stays text.
interface Ctx {
  /** URL that serves an image at this absolute path, if the caller can serve it. */
  localImage?: (path: string) => string;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function safeHref(href: string): string | null {
  try {
    return SAFE_PROTOCOLS.has(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

function link(href: string, children: ReactNode, key: number): ReactNode {
  const url = safeHref(href);
  if (!url) return <Fragment key={key}>{children}</Fragment>;
  return (
    <a key={key} href={url} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function inline(tokens: Token[] | undefined, ctx: Ctx): ReactNode[] {
  return (tokens ?? []).map((token, key) => {
    const t = token as Tokens.Generic;
    switch (t.type) {
      case "strong":
        return <strong key={key}>{inline(t.tokens, ctx)}</strong>;
      case "em":
        return <em key={key}>{inline(t.tokens, ctx)}</em>;
      case "del":
        return <del key={key}>{inline(t.tokens, ctx)}</del>;
      case "codespan":
        return <code key={key}>{t.text}</code>;
      case "br":
        return <br key={key} />;
      case "link":
        return link(t.href, inline(t.tokens, ctx), key);
      case "image": {
        // A local path is an image the agent made: the dashboard serves it, other images stay links.
        const src = t.href.startsWith("/") ? ctx.localImage?.(t.href) : undefined;
        return src ? <img key={key} className="md-image" src={src} alt={t.text} loading="lazy" /> : link(t.href, t.text || t.href, key);
      }
      case "checkbox":
        return <Choice key={key} type="checkbox" disabled checked={t.checked} />;
      case "text":
        return t.tokens ? <Fragment key={key}>{inline(t.tokens, ctx)}</Fragment> : t.text;
      default:
        // escape, html and unknown tokens: their text, never markup.
        return t.text ?? t.raw;
    }
  });
}

function block(token: Token, key: number, ctx: Ctx): ReactNode {
  const t = token as Tokens.Generic;
  switch (t.type) {
    case "space":
    case "def":
      return null;
    case "heading": {
      const Tag = `h${Math.min(Math.max(t.depth, 1), 6)}` as "h1";
      return <Tag key={key}>{inline(t.tokens, ctx)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{inline(t.tokens, ctx)}</p>;
    case "code":
      return (
        <pre key={key}>
          <code className={t.lang ? `language-${t.lang.split(/\s/)[0]}` : undefined}>{t.text}</code>
        </pre>
      );
    case "blockquote":
      return <blockquote key={key}>{blocks(t.tokens, ctx)}</blockquote>;
    case "hr":
      return <hr key={key} />;
    case "list": {
      const list = t as Tokens.List;
      const items = list.items.map((item, i) => <li key={i}>{item.loose ? blocks(item.tokens, ctx) : tightItem(item.tokens, ctx)}</li>);
      return list.ordered ? (
        <ol key={key} start={list.start === "" || list.start === 1 ? undefined : list.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case "table": {
      const table = t as Tokens.Table;
      const style = (cell: Tokens.TableCell) => (cell.align ? { textAlign: cell.align } : undefined);
      return (
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>
                {table.header.map((cell, i) => (
                  <th key={i} style={style(cell)}>
                    {inline(cell.tokens, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} style={style(cell)}>
                      {inline(cell.tokens, ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "text":
      return <p key={key}>{t.tokens ? inline(t.tokens, ctx) : t.text}</p>;
    default:
      return <p key={key}>{t.text ?? t.raw}</p>;
  }
}

// A tight item mixes inline text with nested blocks (lists, code…): only text stays inline.
function tightItem(tokens: Token[], ctx: Ctx): ReactNode[] {
  return tokens.map((token, key) => {
    const t = token as Tokens.Generic;
    if (t.type === "text") return <Fragment key={key}>{inline(t.tokens ?? [t], ctx)}</Fragment>;
    if (t.type === "checkbox") return inline([t], ctx)[0];
    return block(token, key, ctx);
  });
}

function blocks(tokens: Token[] | undefined, ctx: Ctx): ReactNode[] {
  return (tokens ?? []).map((token, key) => block(token, key, ctx));
}

export function renderMarkdown(text: string, ctx: Ctx = {}): ReactNode {
  return <>{blocks(marked.lexer(text, { gfm: true }), ctx)}</>;
}
