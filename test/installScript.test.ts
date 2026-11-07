import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

const script = join(import.meta.dir, "..", "install.sh");

function dryRun(uname: [string, string], extra: Record<string, string> = {}) {
  const result = Bun.spawnSync(["sh", script], {
    env: { PATH: process.env.PATH, T3_DASHBOARD_DRY_RUN: "1", T3_DASHBOARD_UNAME_S: uname[0], T3_DASHBOARD_UNAME_M: uname[1], ...extra },
  });
  return { code: result.exitCode, out: result.stdout.toString().trim(), err: result.stderr.toString().trim() };
}

const LATEST = "https://github.com/simonzsh/t3-dashboard/releases/latest/download";

test("maps the 4 supported uname pairs to release assets", () => {
  const cases: [[string, string], string][] = [
    [["Darwin", "arm64"], "t3-dashboard-darwin-arm64"],
    [["Darwin", "x86_64"], "t3-dashboard-darwin-x64"],
    [["Linux", "x86_64"], "t3-dashboard-linux-x64"],
    [["Linux", "aarch64"], "t3-dashboard-linux-arm64"],
  ];
  for (const [uname, asset] of cases) {
    const { code, out } = dryRun(uname);
    assert.equal(code, 0, uname.join(" "));
    assert.equal(out, `${LATEST}/${asset}`);
  }
});

test("amd64 counts as x64", () => {
  assert.equal(dryRun(["Linux", "amd64"]).out, `${LATEST}/t3-dashboard-linux-x64`);
});

test("a pinned version and another repo change the URL", () => {
  for (const version of ["1.2.3", "v1.2.3"]) {
    const { out } = dryRun(["Linux", "x86_64"], { T3_DASHBOARD_VERSION: version, T3_DASHBOARD_REPO: "o/r" });
    assert.equal(out, "https://github.com/o/r/releases/download/v1.2.3/t3-dashboard-linux-x64");
  }
});

test("an unsupported OS or CPU fails with a message and no URL", () => {
  for (const uname of [["FreeBSD", "x86_64"], ["Linux", "riscv64"]] as [string, string][]) {
    const { code, out, err } = dryRun(uname);
    assert.equal(code, 1, uname.join(" "));
    assert.equal(out, "");
    assert.match(err, /not supported/);
  }
});

// A fake curl copies from a local "release" folder, so the full flow runs without the network.
function fullRun(options: { corrupt?: boolean; noService?: boolean; fakeT3?: boolean }) {
  const root = mkdtempSync(join(tmpdir(), "t3d-sh-"));
  const bin = join(root, "bin");
  const release = join(root, "release");
  const dest = join(root, "dest");
  for (const dir of [bin, release]) mkdirSync(dir);
  const asset = "t3-dashboard-linux-x64";
  const body = '#!/bin/sh\necho "fake t3-dashboard $*"\n';
  writeFileSync(join(release, asset), options.corrupt ? "tampered" : body);
  writeFileSync(join(release, "SHA256SUMS"), `${createHash("sha256").update(body).digest("hex")}  ${asset}\n`);
  writeFileSync(join(bin, "curl"), `#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift;; http*) url=$1;; esac; shift; done\ncp "${release}/$(basename "$url")" "$out"\n`, { mode: 0o755 });
  if (options.fakeT3) writeFileSync(join(bin, "t3"), "#!/bin/sh\n", { mode: 0o755 });
  const result = Bun.spawnSync(["sh", script], {
    env: {
      // A fixed PATH keeps a t3 installed on this machine out of the check.
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: root,
      T3_DASHBOARD_UNAME_S: "Linux",
      T3_DASHBOARD_UNAME_M: "x86_64",
      T3_DASHBOARD_INSTALL_DIR: dest,
      ...(options.noService ? { T3_DASHBOARD_NO_SERVICE: "1" } : {}),
    },
  });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString(), dest, root };
}

test("downloads, verifies, installs the binary, then runs `install`", () => {
  const run = fullRun({});
  assert.equal(run.code, 0, run.err);
  assert.ok(existsSync(join(run.dest, "t3-dashboard")));
  assert.match(run.out, /fake t3-dashboard install/);
  assert.match(run.out, /not in your PATH/);
  rmSync(run.root, { recursive: true });
});

test("T3_DASHBOARD_NO_SERVICE=1 skips the service", () => {
  const run = fullRun({ noService: true });
  assert.equal(run.code, 0, run.err);
  assert.doesNotMatch(run.out, /fake t3-dashboard/);
  rmSync(run.root, { recursive: true });
});

test("a checksum mismatch installs nothing", () => {
  const run = fullRun({ corrupt: true });
  assert.equal(run.code, 1);
  assert.match(run.err, /checksum mismatch/);
  assert.equal(existsSync(join(run.dest, "t3-dashboard")), false);
  rmSync(run.root, { recursive: true });
});

test("a missing t3 warns on stderr, still installs the service and exits 0", () => {
  const run = fullRun({});
  assert.equal(run.code, 0, run.err);
  assert.match(run.err, /T3 Code \(t3\) was not found/);
  assert.match(run.err, /https:\/\/t3\.codes/);
  assert.match(run.err, /curl -fsSL https:\/\/t3\.codes\/install\.sh \| sh/);
  assert.match(run.out, /fake t3-dashboard install/);
  rmSync(run.root, { recursive: true });
});

test("an installed t3 prints no warning", () => {
  const run = fullRun({ fakeT3: true });
  assert.equal(run.code, 0, run.err);
  assert.doesNotMatch(run.err, /T3 Code/);
  rmSync(run.root, { recursive: true });
});

test("a dry run prints only the URL, with no t3 check", () => {
  const { out, err } = dryRun(["Linux", "x86_64"]);
  assert.equal(out, `${LATEST}/t3-dashboard-linux-x64`);
  assert.equal(err, "");
});

test("install.ps1 warns about a missing t3 and never throws for it", () => {
  const ps1 = readFileSync(join(import.meta.dir, "..", "install.ps1"), "utf8");
  assert.match(ps1, /Get-Command t3/);
  assert.match(ps1, /Write-Warning "T3 Code \(t3\) was not found/);
  assert.doesNotMatch(ps1, /throw[^\n]*T3 Code/);
});
