import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrDetail as Detail, PrList, PrSummary } from "../../../../shared/pulls.ts";
import type { DiffFile } from "../../../../shared/diff.ts";
import { DiffFiles, HunkRows } from "../../../src/features/pulls/DiffFiles.tsx";
import { PrListView } from "../../../src/features/pulls/PullsView.tsx";
import { PrDetail } from "../../../src/features/pulls/PrDetail.tsx";
import { thread } from "../../fixtures.ts";

const now = new Date("2026-01-02T00:00:00Z");
const pr = (repository: string, number: number, over: Partial<PrSummary> = {}): PrSummary => ({
  repository, number, title: `Change ${number}`, url: `https://example.test/${repository}/pull/${number}`, author: "ada", draft: false, headRef: `feature-${number}`, baseRef: "main",
  updatedAt: "2026-01-01T23:00:00Z", additions: 7, deletions: 2, checks: "success", review: "approved", roles: ["author"], ...over,
});
const list = (prs: PrSummary[]): PrList => ({ prs, fetchedAt: now.toISOString() });
const view = (value: PrList | null, threads = [thread("t1")], error: string | null = null) =>
  renderToStaticMarkup(<PrListView list={value} error={error} refreshing={false} onRefresh={() => {}} threads={threads} now={now} onOpenThread={() => {}} />);

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

test("a pull request linked to a session shows a button to open it", () => {
  const linked = thread("t1", { pullRequest: { repository: "acme/storefront", number: 1, url: "https://example.test/x" } });
  assert.equal(view(list([pr("acme/storefront", 1), pr("acme/storefront", 2)]), [linked]).match(/pulls-row-session/g)?.length, 1);
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
const diff = (files: DiffFile[], truncated = false) => renderToStaticMarkup(<DiffFiles files={files} truncated={truncated} refreshing={false} onRefresh={() => {}} />);

test("each file is a collapsible block with line numbers, counts and highlighted code", () => {
  const html = diff([file("src/a.ts")]);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /<span class="dir">src\/<\/span><span class="name">a.ts<\/span>/);
  assert.match(html, /<span class="add">\+1<\/span> <span class="del">-1<\/span>/);
  assert.match(html, /Collapse all/);
});

test("a hunk shows both line numbers, the marks, and the code highlighted on each side", () => {
  const [hunk] = file("src/a.ts").hunks;
  const html = renderToStaticMarkup(<table><tbody><HunkRows hunk={{ ...hunk!, lines: [...hunk!.lines, { kind: "context", text: "return a;", oldNo: 2, newNo: 2, noNewline: true }] }} lang="typescript" /></tbody></table>);
  assert.match(html, /<tr class="pr-diff-line del"><td class="pr-diff-no">1<\/td><td class="pr-diff-no"><\/td><td class="pr-diff-mark">-<\/td>/);
  assert.match(html, /<tr class="pr-diff-line add"><td class="pr-diff-no"><\/td><td class="pr-diff-no">1<\/td><td class="pr-diff-mark">\+<\/td>/);
  assert.match(html, /<tr class="pr-diff-line context"><td class="pr-diff-no">2<\/td><td class="pr-diff-no">2<\/td>/);
  assert.match(html, /<span class="hljs-keyword">const<\/span> a = <span class="hljs-number">2<\/span>;/);
  assert.match(html, /@@ -1 \+1 @@/);
  assert.match(html, /No newline at end of file/);
});

test("a large file starts collapsed and the tests button shows only with a test file", () => {
  const html = diff([file("big.ts", { additions: 500 }), file("src/a.test.ts")]);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Collapse tests/);
  assert.doesNotMatch(diff([file("src/a.ts")]), /tests/);
  assert.match(diff([file("big.ts", { additions: 500 })]), /Expand all/);
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
    <PrDetail pr={{ repository: "acme/storefront", number: 12 }} detail={detail} detailError={null} diff={{ headSha: "abc", files: [file("src/a.ts")], truncated: false }} diffError={null} refreshing={false} onRefresh={() => {}} now={now} session={null} onOpenSession={() => {}} {...over} />,
  );

test("the detail shows the title, branches, checks, reviews and a link to GitHub", () => {
  const html = page();
  assert.match(html, /Change 12/);
  assert.match(html, /<code>feature-12<\/code> → <code>main<\/code>/);
  assert.match(html, /Checks failed/);
  assert.match(html, /Review required/);
  assert.match(html, /<a [^>]*href="https:\/\/example.test\/acme\/storefront\/pull\/12"[^>]*>.*Open on GitHub/);
  assert.match(html, /<strong>grace<\/strong> changes requested/);
  assert.match(html, /href="#\/pulls"/);
});

test("a check link that is not a web address is shown as text", () => {
  const html = page();
  assert.match(html, /<a href="https:\/\/example.test\/run\/1"[^>]*>build<\/a>/);
  assert.doesNotMatch(html, /javascript:/);
});

test("the detail shows a session button only when a session is linked", () => {
  assert.doesNotMatch(page(), /Open session/);
  assert.match(page({ session: thread("t1") }), /Open session/);
});

test("the detail shows a loader before the data and keeps errors apart", () => {
  const loading = page({ detail: null, diff: null });
  assert.match(loading, /acme\/storefront#12/);
  assert.match(loading, /role="status"/);
  const failed = page({ diff: null, diffError: "Could not load the diff. GitHub refused the request" });
  assert.match(failed, /Change 12/);
  assert.match(failed, /role="alert"[^>]*>Could not load the diff/);
});
