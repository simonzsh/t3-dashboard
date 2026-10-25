import assert from "node:assert/strict";
import { test } from "bun:test";
import { IntegrationError } from "../../../src/integrations/errors.ts";
import { assetName, downloadAsset, latestTag, parseSums, releaseSums } from "../../../src/integrations/github/releases.ts";

const serve = (respond: (url: string) => Response) => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => (urls.push(url), respond(url))) as unknown as typeof fetch;
  return { fetchImpl, urls };
};

test("asset names for the 5 release targets", () => {
  assert.equal(assetName("darwin", "arm64"), "t3-dashboard-darwin-arm64");
  assert.equal(assetName("darwin", "x64"), "t3-dashboard-darwin-x64");
  assert.equal(assetName("linux", "x64"), "t3-dashboard-linux-x64");
  assert.equal(assetName("linux", "arm64"), "t3-dashboard-linux-arm64");
  assert.equal(assetName("win32", "x64"), "t3-dashboard-windows-x64.exe");
  assert.equal(assetName("win32", "arm64"), "t3-dashboard-windows-x64.exe");
  assert.throws(() => assetName("freebsd", "x64"), /not supported/);
  assert.throws(() => assetName("linux", "ia32"), /not supported/);
});

test("parseSums reads `<hex>  <asset>` lines", () => {
  const sums = parseSums("abc123  t3-dashboard-linux-x64\n\nDEF456 *t3-dashboard-windows-x64.exe\n");
  assert.equal(sums.get("t3-dashboard-linux-x64"), "abc123");
  assert.equal(sums.get("t3-dashboard-windows-x64.exe"), "def456");
});

test("latestTag reads tag_name from the GitHub API", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => (urls.push(url), Response.json({ tag_name: "v1.2.3" }))) as unknown as typeof fetch;
  assert.equal(await latestTag(fetchImpl, "o/r"), "v1.2.3");
  assert.deepEqual(urls, ["https://api.github.com/repos/o/r/releases/latest"]);
  const bad = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(latestTag(bad, "o/r"), /404/);
});

test("a release without a usable tag_name is a protocol error that names the field", async () => {
  for (const body of [{}, { tag_name: 3 }]) {
    const { fetchImpl } = serve(() => Response.json(body));
    const error = await latestTag(fetchImpl, "o/r").catch((caught: unknown) => caught);
    assert.ok(error instanceof IntegrationError);
    assert.deepEqual([error.system, error.kind], ["github", "protocol"]);
    assert.match(error.message, /^Unexpected GitHub release: tag_name should be string/);
  }
  const { fetchImpl } = serve(() => Response.json({ tag_name: "" }));
  await assert.rejects(latestTag(fetchImpl, "o/r"), /GitHub returned no release tag/);
});

test("latestTag reports the status when GitHub refuses, and a network failure as unreachable", async () => {
  const { fetchImpl } = serve(() => new Response("no", { status: 404 }));
  const refused = (await latestTag(fetchImpl, "o/r").catch((caught: unknown) => caught)) as IntegrationError;
  assert.deepEqual([refused.kind, refused.status, refused.message], ["refused", 404, "GitHub answered 404 for the latest release"]);
  const offline = (async () => {
    throw new Error("connect failed");
  }) as unknown as typeof fetch;
  const unreachable = (await latestTag(offline, "o/r").catch((caught: unknown) => caught)) as IntegrationError;
  assert.deepEqual([unreachable.kind, unreachable.message], ["unreachable", "connect failed"]);
});

test("releaseSums and downloadAsset read the release download URLs", async () => {
  const { fetchImpl, urls } = serve((url) => new Response(url.endsWith("SHA256SUMS") ? "abc123  t3-dashboard-linux-x64\n" : "bytes"));
  assert.equal((await releaseSums(fetchImpl, "o/r", "v2.0.0")).get("t3-dashboard-linux-x64"), "abc123");
  assert.equal(new TextDecoder().decode(await downloadAsset(fetchImpl, "o/r", "v2.0.0", "t3-dashboard-linux-x64")), "bytes");
  assert.deepEqual(urls, ["https://github.com/o/r/releases/download/v2.0.0/SHA256SUMS", "https://github.com/o/r/releases/download/v2.0.0/t3-dashboard-linux-x64"]);
});

test("a failed download names the URL and the status", async () => {
  const { fetchImpl } = serve(() => new Response("gone", { status: 404 }));
  const error = (await downloadAsset(fetchImpl, "o/r", "v2.0.0", "a").catch((caught: unknown) => caught)) as IntegrationError;
  assert.deepEqual([error.system, error.status], ["github", 404]);
  assert.equal(error.message, "Download failed (404): https://github.com/o/r/releases/download/v2.0.0/a");
});
