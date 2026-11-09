import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GitHubConnectionStatus } from "../../../src/features/settings/GitHubSettings.tsx";

test("GitHub connection states show text and only connected has a green dot", () => {
  const labels = { connected: "Connected", "not-connected": "Not connected", "not-installed": "Not installed", error: "Check failed" } as const;
  for (const status of Object.keys(labels) as Array<keyof typeof labels>) {
    const html = renderToStaticMarkup(<GitHubConnectionStatus status={status} />);
    assert.ok(html.includes(labels[status]));
    assert.equal(html.includes("conn-dot"), status === "connected");
  }
});
