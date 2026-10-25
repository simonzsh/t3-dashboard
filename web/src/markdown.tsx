import { marked, type Token, type Tokens } from "marked";
import { Fragment, type ReactNode } from "react";

// marked is only the lexer: tokens become React elements, so raw HTML stays text.
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

function inline(tokens: Token[] | undefined): ReactNode[] {
  return (tokens ?? []).map((token, key) => {
    const t = token as Tokens.Generic;
    switch (t.type) {
      case "strong":
        return <strong key={key}>{inline(t.tokens)}</strong>;
      case "em":
        return <em key={key}>{inline(t.tokens)}</em>;
      case "del":
        return <del key={key}>{inline(t.tokens)}</del>;
      case "codespan":
        return <code key={key}>{t.text}</code>;
      case "br":
        return <br key={key} />;
      case "link":
        return link(t.href, inline(t.tokens), key);
      case "image":
        return link(t.href, t.text || t.href, key);
      case "checkbox":
        return <input key={key} type="checkbox" disabled checked={t.checked} />;
      case "text":
        return t.tokens ? <Fragment key={key}>{inline(t.tokens)}</Fragment> : t.text;
      default:
        // escape, html and unknown tokens: their text, never markup.
        return t.text ?? t.raw;
    }
  });
}

function block(token: Token, key: number): ReactNode {
  const t = token as Tokens.Generic;
  switch (t.type) {
    case "space":
    case "def":
      return null;
    case "heading": {
      const Tag = `h${Math.min(Math.max(t.depth, 1), 6)}` as "h1";
      return <Tag key={key}>{inline(t.tokens)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{inline(t.tokens)}</p>;
    case "code":
      return (
        <pre key={key}>
          <code className={t.lang ? `language-${t.lang.split(/\s/)[0]}` : undefined}>{t.text}</code>
        </pre>
      );
    case "blockquote":
      return <blockquote key={key}>{blocks(t.tokens)}</blockquote>;
    case "hr":
      return <hr key={key} />;
    case "list": {
      const list = t as Tokens.List;
      const items = list.items.map((item, i) => <li key={i}>{item.loose ? blocks(item.tokens) : inline(item.tokens)}</li>);
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
                    {inline(cell.tokens)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} style={style(cell)}>
                      {inline(cell.tokens)}
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
      return <p key={key}>{t.tokens ? inline(t.tokens) : t.text}</p>;
    default:
      return <p key={key}>{t.text ?? t.raw}</p>;
  }
}

function blocks(tokens: Token[] | undefined): ReactNode[] {
  return (tokens ?? []).map(block);
}

export function renderMarkdown(text: string): ReactNode {
  return <>{blocks(marked.lexer(text, { gfm: true }))}</>;
}
