import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { RewindDialog } from "../../../src/features/conversation/RewindDialog.tsx";

const message = { id: "m", role: "user", text: "hi", createdAt: "", streaming: false, attachments: [], rewindable: true } as const;

test("the dialog offers Cancel, Revert and keep changes, and Revert files too, with no checkbox", () => {
  const html = renderToStaticMarkup(<RewindDialog message={message} onClose={() => {}} onConfirm={async () => {}} />);
  for (const label of ["Cancel", "Revert and keep changes", "Revert files too"]) assert.match(html, new RegExp(`<button[^>]*>${label}</button>`));
  assert.doesNotMatch(html, /type="checkbox"/);
});
