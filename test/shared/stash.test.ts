import assert from "node:assert/strict";
import { test } from "bun:test";
import { liveUploads, normalizeStash, STASH_LIMIT, stashPreview, type StashEntry } from "../../shared/stash.ts";

const upload = { type: "image" as const, id: "u1", name: "shot.png", mimeType: "image/png", sizeBytes: 10 };
const entry = (over: Partial<StashEntry> = {}): StashEntry => ({ id: "a", text: "hello", uploads: [], createdAt: "2026-11-04T10:00:00.000Z", threadId: "t", threadTitle: "T", ...over });

test("normalizeStash keeps at most the limit", () => {
  const entries = Array.from({ length: 25 }, (_, i) => entry({ id: `e${i}` }));
  assert.equal(normalizeStash({ entries })!.length, STASH_LIMIT);
  assert.equal(normalizeStash([]), null);
});

test("uploads stay usable for 24 hours, then they are reported by name", () => {
  const e = entry({ uploads: [upload] });
  assert.deepEqual(liveUploads(e, new Date("2026-11-05T10:00:00Z")), { uploads: [upload], expired: [] });
  assert.deepEqual(liveUploads(e, new Date("2026-11-05T10:00:01Z")), { uploads: [], expired: ["shot.png"] });
});

test("the preview is the first non-empty line, or the attachment count", () => {
  assert.equal(stashPreview(entry({ text: "\n  first line \nsecond" })), "first line");
  assert.equal(stashPreview(entry({ text: " ", uploads: [upload] })), "1 attachment");
  assert.equal(stashPreview(entry({ text: "", uploads: [upload, upload] })), "2 attachments");
});
