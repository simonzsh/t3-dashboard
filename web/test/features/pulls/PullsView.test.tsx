import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrDetail as Detail, PrList, PrSummary } from "../../../../shared/pulls.ts";
import type { DiffFile } from "../../../../shared/diff.ts";
import { DiffFiles, HunkRows } from "../../../src/features/pulls/DiffFiles.tsx";
import * as highlighter from "../../../src/features/pulls/highlight.tsx";
import { openByDefault } from "../../../src/features/pulls/diffView.ts";
import { FileNav } from "../../../src/features/pulls/FileNav.tsx";
import { ChecksPanel, StatusButton } from "../../../src/features/pulls/PrChecks.tsx";
import { PrHeader, type DiffControls } from "../../../src/features/pulls/PrHeader.tsx";
import { PrListView } from "../../../src/features/pulls/PullsView.tsx";
import { PrDetail, tabsOf } from "../../../src/features/pulls/PrDetail.tsx";
import { memoryStore, thread } from "../../fixtures.ts";
import { PULLS_LIST_KEY } from "../../../src/features/pulls/prefs.ts";
import type { OpenPrs } from "../../../src/lib/prSeen.ts";

const now = new Date("2026-01-02T00:00:00Z");
const pr = (repository: string, number: number, over: Partial<PrSummary> = {}): PrSummary => ({
  repository, number, title: `Change ${number}`, url: `https://example.test/${repository}/pull/${number}`, author: "ada", draft: false, headRef: `feature-${number}`, baseRef: "main",
  createdAt: "2026-01-01T20:00:00Z", updatedAt: "2026-01-01T23:00:00Z", additions: 7, deletions: 2, checks: "success", review: "approved", roles: ["author"], headSha: "", ...over,
});
const list = (prs: PrSummary[]): PrList => ({ prs, fetchedAt: now.toISOString() });
const view = (value: PrList | null, threads = [thread("t1")], error: string | null = null, openPrs: OpenPrs = new Map()) =>
  renderToStaticMarkup(<PrListView list={value} error={error} refreshing={false} onRefresh={() => {}} threads={threads} now={now} onOpenThread={() => {}} openPrs={openPrs} />);

test("the list groups pull requests by repository and links each one to its diff", () => {
  const html = view(list([pr("acme/storefront", 1), pr("acme/api", 2, { draft: true, checks: "failure", review: "changes_requested" })]));
  assert.ok(html.indexOf("acme/api") < html.indexOf("acme/storefront"));
  assert.match(html, /href="#\/pulls\/acme\/storefront\/1"/);
  assert.match(html, /Change 2/);
  assert.match(html, /Draft/);
  assert.match(html, /Checks failed/);
  assert.match(html, /Changes requested/);
  assert.match(html, /\+7/);
  assert.match(html, /1 h ago/);
});

// The list reads its filters from localStorage; a static render has none unless a test sets it.
function withStorage<T>(data: Record<string, string>, run: () => T): T {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: memoryStore(data), configurable: true });
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("the list starts with the saved filters, and a saved repository that left the list falls back to all", () => {
  const prs = list([pr("acme/storefront", 1, { roles: ["author"] }), pr("acme/api", 2, { roles: ["reviewer"] })]);
  const mine = withStorage({ [PULLS_LIST_KEY]: JSON.stringify({ scope: "author", repository: "acme/storefront" }) }, () => view(prs));
  assert.match(mine, /Change 1/);
  assert.doesNotMatch(mine, /Change 2/);
  assert.match(mine, /aria-checked="true"[^>]*>Mine</);
  const gone = withStorage({ [PULLS_LIST_KEY]: JSON.stringify({ scope: "all", repository: "acme/gone" }) }, () => view(prs));
  assert.match(gone, /Change 1[\s\S]*Change 2|Change 2[\s\S]*Change 1/);
  assert.match(gone, /All repositories/);
});

test("an unread row shows the unread ring, and the Unread filter shows its count and keeps only unread rows", () => {
  const prs = list([pr("acme/storefront", 1), pr("acme/storefront", 2)]);
  const open: OpenPrs = new Map([["pr:acme/storefront#1", { createdAt: "2026-01-01T20:00:00.000Z", unread: true }], ["pr:acme/storefront#2", { createdAt: "2026-01-01T20:00:00.000Z", unread: false }]]);
  const all = view(prs, undefined, null, open);
  assert.equal(all.match(/class="notif-dot"/g)?.length, 1);
  assert.match(all, /Change 1<span class="notif-dot" role="img" aria-label="Unread">/);
  assert.match(all, />Unread 1</);
  const unread = withStorage({ [PULLS_LIST_KEY]: JSON.stringify({ scope: "unread", repository: "all" }) }, () => view(prs, undefined, null, open));
  assert.match(unread, /Change 1/);
  assert.doesNotMatch(unread, /Change 2/);
  const none = withStorage({ [PULLS_LIST_KEY]: JSON.stringify({ scope: "unread", repository: "all" }) }, () => view(prs));
  assert.match(none, /All caught up/);
  assert.match(none, />Unread</);
});

const linkTo = (number: number) => ({ pullRequests: [{ repository: "acme/storefront", number, url: "https://example.test/x", title: null }] });

test("a pull request with one session shows a button to open it, with several a menu that counts them", () => {
  const one = view(list([pr("acme/storefront", 1), pr("acme/storefront", 2)]), [thread("t1", linkTo(1))]);
  assert.equal(one.match(/pulls-row-session/g)?.length, 1);
  assert.match(one, /<button [^>]*class="[^"]*pulls-row-session[^"]*"[^>]*>.*Session<\/button>/);
  const two = view(list([pr("acme/storefront", 1)]), [thread("t1", linkTo(1)), thread("t2", linkTo(1))]);
  assert.match(two, /aria-label="2 sessions"[^>]*aria-haspopup="menu"/);
  assert.match(two, /Sessions 2/);
  assert.doesNotMatch(view(list([pr("acme/storefront", 1)])), /pulls-row-session/);
});

test("the list has filters, an empty state and an error", () => {
  const html = view(list([pr("acme/storefront", 1)]));
  assert.match(html, /aria-label="Show"/);
  assert.match(html, /aria-label="Repository"/);
  assert.match(view(list([])), /No open pull requests/);
  assert.match(view(null, [], "Could not load the pull requests. GitHub CLI is not signed in"), /role="alert"[^>]*>Could not load the pull requests/);
  assert.match(view(null), /role="status"/);
});

const file = (path: string, over: Partial<DiffFile> = {}): DiffFile => ({
  path, oldPath: path, newPath: path, status: "modified", binary: false, additions: 1, deletions: 1,
  hunks: [{ header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "del", text: "const a = 1;", oldNo: 1 }, { kind: "add", text: "const a = 2;", newNo: 1 }] }], ...over,
});
const diff = (files: DiffFile[], truncated = false) => {
  const open = openByDefault(files);
  return renderToStaticMarkup(<DiffFiles files={files} truncated={truncated} open={(path) => open.has(path)} onToggle={() => {}} />);
};

test("each file is a collapsible block with line numbers, counts and highlighted code", () => {
  const html = diff([file("src/a.ts")]);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /<span class="dir">src\/<\/span><span class="name">a.ts<\/span>/);
  assert.match(html, /<span class="add">\+1<\/span> <span class="del">-1<\/span>/);
  assert.match(html, /data-pr-diff-file="src\/a.ts"/);
});

test("a hunk shows both line numbers, the marks, and the code highlighted on each side", () => {
  const [hunk] = file("src/a.ts").hunks;
  const html = renderToStaticMarkup(<table><tbody><HunkRows hunk={{ ...hunk!, lines: [...hunk!.lines, { kind: "context", text: "return a;", oldNo: 2, newNo: 2, noNewline: true }] }} lang="typescript" hl={highlighter} /></tbody></table>);
  assert.match(html, /<tr class="pr-diff-line del"><td class="pr-diff-no">1<\/td><td class="pr-diff-no"><\/td><td class="pr-diff-mark">-<\/td>/);
  assert.match(html, /<tr class="pr-diff-line add"><td class="pr-diff-no"><\/td><td class="pr-diff-no">1<\/td><td class="pr-diff-mark">\+<\/td>/);
  assert.match(html, /<tr class="pr-diff-line context"><td class="pr-diff-no">2<\/td><td class="pr-diff-no">2<\/td>/);
  assert.match(html, /<span class="hljs-keyword">const<\/span> a = <span class="hljs-number">2<\/span>;/);
  assert.match(html, /@@ -1 \+1 @@/);
  assert.match(html, /No newline at end of file/);
});

test("a large file starts collapsed", () => {
  assert.match(diff([file("big.ts", { additions: 500 }), file("src/a.test.ts")]), /aria-expanded="false"/);
});

test("a large collapsed file offers a button instead of its lines", () => {
  const big = diff([file("big.ts", { additions: 500 })]);
  assert.match(big, /Load diff \(501 lines\)/);
  assert.doesNotMatch(big, /pr-diff-line/);
  assert.doesNotMatch(diff([file("small.ts")]), /Load diff/);
  assert.doesNotMatch(diff([file("big.png", { additions: 500, binary: true, hunks: [] })]), /Load diff/);
  assert.doesNotMatch(diff([file("big.json", { additions: 500, truncated: true, hunks: [] })]), /Load diff/);
});

test("binary, hidden and empty files explain themselves", () => {
  assert.match(diff([file("logo.png", { binary: true, hunks: [] })]), /Binary file/);
  assert.match(diff([file("big.json", { truncated: true, additions: 300, hunks: [] })]), /Large diff hidden \(301 changed lines\)/);
  assert.match(diff([file("a.sh", { additions: 0, deletions: 0, oldMode: "100644", newMode: "100755", hunks: [] })]), /Mode changed 100644 → 100755/);
  assert.match(diff([], true), /too large/);
  assert.match(diff([]), /No changes/);
});

const detail: Detail = {
  ...pr("acme/storefront", 12, { checks: "failure", review: "review_required" }), state: "open", headSha: "abc", body: "", changedFiles: 3,
  checkRuns: [{ name: "build", state: "success", url: "https://example.test/run/1" }, { name: "lint", state: "failure", url: "javascript:alert(1)" }],
  reviews: [{ author: "grace", state: "CHANGES_REQUESTED", submittedAt: null }],
};
const page = (over: Partial<Parameters<typeof PrDetail>[0]> = {}) =>
  renderToStaticMarkup(
    <PrDetail pr={{ repository: "acme/storefront", number: 12 }} detail={detail} detailError={null} diff={{ headSha: "abc", files: [file("src/a.ts")], truncated: false }} diffError={null} refreshing={false} onRefresh={() => {}} now={now} sessions={[]} onOpenSession={() => {}} {...over} />,
  );

const controls = (over: Partial<DiffControls> = {}): DiffControls => ({ hasFiles: true, hasTests: false, anyOpen: true, testsOpen: false, toggleAll: () => {}, toggleTests: () => {}, ...over });
const header = (over: Partial<Parameters<typeof PrHeader>[0]> = {}) =>
  renderToStaticMarkup(
    <PrHeader pr={{ repository: "acme/storefront", number: 12 }} detail={detail} now={now} sessions={[]} onOpenSession={() => {}} controls={controls()} refreshing={false} onRefresh={() => {}} phone={false} {...over} />,
  );

test("the header holds the title, the meta line, the badges and the actions on one block", () => {
  const html = header();
  assert.match(html, /<header class="pulls-head">/);
  assert.match(html, /<a [^>]*href="#\/pulls"[^>]*aria-label="Back to pull requests"/);
  assert.match(html, /Change 12 <span class="pulls-num">#12<\/span>/);
  assert.match(html, /<code>feature-12<\/code> → <code>main<\/code>/);
  assert.match(html, /aria-label="Checks and reviews"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  assert.match(html, /Checks failed[\s\S]*Review required/);
  assert.match(html, /3 files/);
  assert.match(html, /<h2 class="pulls-title">Change 12/);
  assert.match(html, /aria-label="Collapse all"/);
  assert.match(html, /aria-label="Refresh"/);
  assert.doesNotMatch(html, /Collapse tests|Changed files/);
  assert.match(header({ controls: controls({ hasTests: true, testsOpen: true }) }), /aria-label="Collapse tests"/);
  assert.match(header({ controls: controls({ anyOpen: false }) }), /aria-label="Expand all"/);
  assert.match(header({ filesPanel: { hidden: false, onToggle: () => {} } }), /aria-label="Hide files"/);
  assert.match(header({ filesPanel: { hidden: true, onToggle: () => {} } }), /aria-label="Show files"/);
  assert.match(header({ onShowFiles: () => {} }), /aria-label="Changed files"/);
});

test("the header opens no session, one session, or a menu of several", () => {
  const none = header();
  assert.match(none, /<a href="https:\/\/example.test\/acme\/storefront\/pull\/12" target="_blank" rel="noreferrer noopener" class="btn sm"><svg[^>]*>.*<\/svg> Open on GitHub<\/a>/);
  assert.doesNotMatch(none, /Open session|Sessions \d/);
  assert.match(header({ sessions: [thread("t1")] }), /<button [^>]*>.*Open session<\/button>/);
  assert.match(header({ sessions: [thread("t1"), thread("t2")] }), /aria-label="2 sessions"[^>]*aria-haspopup="menu"[\s\S]*Sessions 2/);
});

test("on a phone the header keeps the title and one actions menu, without the meta line", () => {
  const html = header({ phone: true, sessions: [thread("t1"), thread("t2")] });
  assert.match(html, /Change 12/);
  assert.match(html, /aria-haspopup="menu"[^>]*aria-label="Pull request actions"/);
  assert.doesNotMatch(html, /Open on GitHub|Sessions 2|feature-12|aria-label="Refresh"/);
});

test("the checks panel lists each check with its result and link, then the reviews", () => {
  const html = renderToStaticMarkup(<ChecksPanel detail={detail} />);
  assert.match(html, /<a href="https:\/\/example.test\/run\/1"[^>]*>build<\/a>/);
  assert.match(html, /<li class="pulls-check failure">.*<span>lint<\/span><span class="pulls-check-state">failure<\/span>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<strong>grace<\/strong> changes requested/);
  assert.match(renderToStaticMarkup(<ChecksPanel detail={{ ...detail, checkRuns: [], reviews: [] }} />), /No reviews yet/);
  assert.equal(renderToStaticMarkup(<StatusButton detail={{ ...detail, checks: "none", review: "none", checkRuns: [], reviews: [] }} />), "");
});

test("the file tree groups the files by folder, marks the current one and dims a collapsed test file", () => {
  const files = [file("web/src/a.ts", { additions: 4, deletions: 2 }), file("web/src/b.ts"), file("web/test/a.test.ts"), file("README.md")];
  const html = renderToStaticMarkup(<FileNav files={files} open={(path) => path !== "web/test/a.test.ts"} active="web/src/a.ts" onPick={() => {}} />);
  assert.match(html, /<nav class="pulls-file-nav" aria-label="Changed files">/);
  assert.match(html, /Files <span class="pulls-file-count">4<\/span>/);
  // "web" holds two folders, so it stays a folder; "src" and "test" are its children.
  assert.match(html, /aria-expanded="true"[^>]*>.*<span class="ui-tree-name"[^>]*>web<\/span>/);
  assert.match(html, /<span class="ui-tree-name"[^>]*>src<\/span>[\s\S]*<span class="ui-tree-name"[^>]*>test<\/span>/);
  assert.match(html, /class="ui-tree-row active"[^>]*aria-current="true" aria-label="web\/src\/a.ts"[^>]*>.*a.ts<\/span><span class="pr-diff-counts"><span class="add">\+4<\/span> <span class="del">-2/);
  assert.match(html, /class="ui-tree-row dim"[^>]*aria-label="web\/test\/a.test.ts \(test\)"/);
  assert.match(html, /aria-label="README.md"/);
  assert.doesNotMatch(renderToStaticMarkup(<FileNav files={files} open={() => true} active={null} onPick={() => {}} />), /dim|aria-current/);
});

test("the detail is a list page: the header above the scroll box, the diff inside it", () => {
  const html = page();
  assert.match(html, /<section class="list-page flush pulls-detail" aria-label="Pull request"><div class="list-page-head"><header class="pulls-head">/);
  assert.match(html, /<div class="list-page-body page-scroll bleed"><div class="pulls-detail-grid">.*data-pr-diff-file="src\/a.ts"/);
  assert.match(html, /<a [^>]*href="https:\/\/example.test\/acme\/storefront\/pull\/12"[^>]*>.*Open on GitHub<\/a>/);
  // A static render is narrow: the file list waits in a sheet behind the header button.
  assert.match(html, /aria-label="Changed files"/);
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Changed files"/);
});

test("the detail has Description and Changes tabs, and opens on the description", () => {
  const html = page();
  assert.match(html, /class="tabs underline pulls-tabs" role="tablist" aria-label="Pull request"/);
  assert.match(html, /id="pr-tab-description" aria-selected="true"[^>]*class="active"><svg[^>]*>.*?<\/svg>Description<\/button>/);
  assert.match(html, /id="pr-tab-changes" aria-selected="false"[^>]*><svg[^>]*>.*?<\/svg>Changes<span class="tabs-count">1<\/span><\/button>/);
  assert.doesNotMatch(html, /id="pr-tab-files"/);
  assert.match(html, /role="tabpanel" id="pr-tab-panel" aria-labelledby="pr-tab-description"/);
  // The description is shown; the diff is already rendered behind it, hidden.
  assert.match(html, /<div class="pulls-description">.*No description\./);
  assert.match(html, /<div class="pulls-changes" hidden="">.*data-pr-diff-file="src\/a.ts"/);
  const withBody = page({ detail: { ...detail, body: "Fixes **the totals**." } });
  assert.match(withBody, /<div class="md"><p>Fixes <strong>the totals<\/strong>\.<\/p><\/div>/);
});

test("the diff lists the files in the order of the file tree", () => {
  const files = [file("web/src/a.ts"), file("README.md"), file("web/lib/b.ts"), file("web/src/c.ts")];
  const html = page({ diff: { headSha: "abc", files, truncated: false } });
  const order = [...html.matchAll(/data-pr-diff-file="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["web/src/a.ts", "web/src/c.ts", "web/lib/b.ts", "README.md"]);
});

test("a phone adds a Files tab; the Changes tab counts the files", () => {
  assert.deepEqual(tabsOf(false, 3).map((t) => [t.label, t.count]), [["Description", undefined], ["Changes", 3]]);
  assert.deepEqual(tabsOf(true, 3).map((t) => t.id), ["description", "changes", "files"]);
  assert.equal(tabsOf(true, 0)[1]!.count, undefined);
});

test("the detail shows a loader before the data and keeps errors apart", () => {
  const loading = page({ detail: null, diff: null });
  assert.match(loading, /acme\/storefront#12/);
  assert.match(loading, /role="status"/);
  const failed = page({ diff: null, diffError: "Could not load the diff. GitHub refused the request" });
  assert.match(failed, /Change 12/);
  assert.match(failed, /role="alert"[^>]*>Could not load the diff/);
});

test("the source session has a visible return button on desktop and phone", () => {
  const sourceSession = thread("source", { title: "Source conversation" });
  for (const phone of [false, true]) {
    const html = header({ phone, sourceSession, sessions: [thread("other"), sourceSession] });
    if (phone) {
      assert.match(html, /aria-label="Back to session"/);
      assert.doesNotMatch(html, /Back to session<\/button>/);
      assert.match(html, /class="icon-button sm ghost pulls-back"/);
    } else {
      assert.match(html, /Back to session<\/button>/);
    }
    assert.doesNotMatch(html, /<span>Source conversation<\/span>/);
    assert.doesNotMatch(html, /aria-label="Back to pull requests"/);
    assert.ok(html.indexOf('class="pulls-head-row"') < html.indexOf("Back to session"));
    assert.ok(html.indexOf("Back to session") < html.indexOf('class="pulls-title"'));
  }
  assert.match(header(), /aria-label="Back to pull requests"/);
});
