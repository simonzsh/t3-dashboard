import { s, type Infer } from "../contract.ts";

export const LatestRelease = s.object({ tag_name: s.string() });

// Pull request shapes read through gh. Every field is optional: a missing one drops the row, not the page.
const text = () => s.optional(s.nullable(s.string()));
const count = () => s.optional(s.nullable(s.number()));
const login = () => s.optional(s.nullable(s.object({ login: text() })));

export const SearchNode = s.object({
  number: count(),
  title: text(),
  url: text(),
  isDraft: s.optional(s.nullable(s.boolean())),
  headRefName: text(),
  headRefOid: text(),
  baseRefName: text(),
  createdAt: text(),
  updatedAt: text(),
  additions: count(),
  deletions: count(),
  reviewDecision: text(),
  author: login(),
  repository: s.optional(s.nullable(s.object({ nameWithOwner: text() }))),
  commits: s.optional(s.nullable(s.object({ nodes: s.optional(s.nullable(s.array(s.nullable(s.object({ commit: s.optional(s.nullable(s.object({ statusCheckRollup: s.optional(s.nullable(s.object({ state: text() }))) }))) }))))) }))),
});
export type SearchNode = Infer<typeof SearchNode>;
export const SearchResponse = s.object({ data: s.object({ search: s.object({ nodes: s.array(s.nullable(SearchNode)) }) }) });

export const RawCheck = s.object({
  __typename: text(),
  name: text(),
  status: text(),
  conclusion: text(),
  detailsUrl: text(),
  context: text(),
  state: text(),
  targetUrl: text(),
});
export type RawCheck = Infer<typeof RawCheck>;

export const PrView = s.object({
  number: count(),
  title: text(),
  url: text(),
  author: login(),
  isDraft: s.optional(s.nullable(s.boolean())),
  state: text(),
  headRefName: text(),
  baseRefName: text(),
  headRefOid: text(),
  createdAt: text(),
  updatedAt: text(),
  additions: count(),
  deletions: count(),
  changedFiles: count(),
  body: text(),
  reviewDecision: text(),
  reviews: s.optional(s.nullable(s.array(s.object({ author: login(), state: text(), submittedAt: text() })))),
  statusCheckRollup: s.optional(s.nullable(s.array(RawCheck))),
});
export type PrView = Infer<typeof PrView>;
