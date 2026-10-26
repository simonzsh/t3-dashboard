import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "t3-dashboard-smoke-"));
const exe = join(dir, process.platform === "win32" ? "t3-dashboard.exe" : "t3-dashboard");
const tokenFile = join(dir, "token.json");
writeFileSync(tokenFile, JSON.stringify({ token: "smoke" }));
// Points at a closed port so the smoke run never reaches a real T3 server.
const runtimeFile = join(dir, "runtime.json");
writeFileSync(runtimeFile, JSON.stringify({ origin: "http://127.0.0.1:1" }));

const build = Bun.spawnSync([process.execPath, "run", join(import.meta.dir, "build.ts"), "--outfile", exe], { stdout: "inherit", stderr: "inherit" });
if (build.exitCode !== 0) process.exit(1);

const cli = (...args: string[]) => Bun.spawnSync([exe, ...args], { cwd: dir, env: { PATH: process.env.PATH, HOME: dir, USERPROFILE: dir } });
const version = cli("--version");
const unknown = cli("frobnicate");

const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
const port = probe.port!;
await probe.stop(true);

// A cwd of its own and a throwaway HOME keep the run away from real config.
const child = Bun.spawn([exe], {
  cwd: dir,
  stdout: "ignore",
  stderr: "inherit",
  env: {
    PATH: process.env.PATH,
    HOME: dir,
    USERPROFILE: dir,
    PORT: String(port),
    T3_DASHBOARD_TOKEN_FILE: tokenFile,
    T3_SERVER_RUNTIME: runtimeFile,
    T3_DASHBOARD_AGENT_CONFIG_DIR: join(dir, "agents"),
    T3_DASHBOARD_LINEAR_FILE: join(dir, "linear.json"),
    T3_DASHBOARD_CONFIG_DIR: join(dir, "config"),
  },
});

const base = `http://127.0.0.1:${port}`;
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

try {
  const deadline = Date.now() + 15_000;
  while (!(await fetch(`${base}/api/health`).then((res) => res.ok, () => false))) {
    if (Date.now() > deadline || child.exitCode !== null) throw new Error("the binary did not answer /api/health");
    await Bun.sleep(100);
  }
  const page = await fetch(base);
  const html = await page.text();
  expect(page.status === 200 && (page.headers.get("content-type") ?? "").includes("text/html"), "/ is not HTML");
  expect(page.headers.get("x-frame-options") === "DENY", "/ lacks x-frame-options");
  expect(html.includes("data-theme"), "the inline theme script is missing");
  expect(/<link[^>]*rel="icon"[^>]*href="data:image\/svg\+xml/.test(html), "the inline favicon is missing");
  const assets = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map((match) => match[1]!).filter((url) => !url.startsWith("data:"));
  expect(assets.some((url) => url.endsWith(".js")) && assets.some((url) => url.endsWith(".css")), "the page references no JS or CSS");
  for (const url of assets) {
    const res = await fetch(new URL(url, base));
    const type = res.headers.get("content-type") ?? "";
    expect(res.status === 200 && /javascript|css|image\/png/.test(type), `${url} answered ${res.status} ${type}`);
    // Dev JSX calls (jsxDEV) crash with production React: the page stays blank.
    if (url.endsWith(".js")) expect(!/void 0,![01],void 0,this\)/.test(await res.text()), `${url} holds dev JSX calls`);
  }
  const worker = await fetch(`${base}/sw.js`);
  expect(worker.status === 200 && (worker.headers.get("content-type") ?? "").includes("javascript"), "/sw.js is not served as JavaScript");
  const manifest = await fetch(`${base}/manifest.webmanifest`);
  expect(manifest.status === 200 && (manifest.headers.get("content-type") ?? "").includes("manifest+json"), "/manifest.webmanifest is not served");
  const icon = await fetch(`${base}/icons/icon-512.png`);
  expect(icon.status === 200 && icon.headers.get("content-type") === "image/png", "/icons/icon-512.png is not served");
  expect(version.stdout.toString().startsWith("t3-dashboard "), "--version prints no version");
  expect(unknown.exitCode === 2, "an unknown command does not exit with 2");
  const pidPath = join(dir, ".local", "state", "t3-dashboard", "dashboard.pid");
  expect(existsSync(pidPath) && readFileSync(pidPath, "utf8").trim() === String(child.pid), "the pid file is missing or wrong");
  expect((await fetch(`${base}/api/health`)).status === 200, "/api/health is not 200");
  expect((await fetch(`${base}/api/health`, { headers: { host: "evil.example" } })).status === 403, "a foreign Host is not refused");
} finally {
  child.kill();
  await child.exited;
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`smoke failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("smoke ok");
