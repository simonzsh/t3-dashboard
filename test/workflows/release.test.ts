import assert from "node:assert/strict";
import { test } from "bun:test";

const source = await Bun.file(new URL("../../.github/workflows/release.yml", import.meta.url)).text();
const workflow = Bun.YAML.parse(source) as {
  on: { push: { branches: string[]; tags: string[] } };
  jobs: Record<string, { if?: string; steps: Array<{ name?: string; run?: string }> }>;
};
const build = workflow.jobs.build!.steps.find(step => step.name === "Build")!.run!;
const publish = workflow.jobs.publish!.steps.find(step => step.name === "Publish")!.run!;
const sha = "a".repeat(40);

function run(script: string, refType: string, refName: string, event: string): string[] {
  const result = Bun.spawnSync(["bash", "-c", script], {
    env: { ...process.env, GITHUB_REF_TYPE: refType, GITHUB_REF_NAME: refName, GITHUB_EVENT_NAME: event, GITHUB_SHA: sha },
  });
  assert.equal(result.exitCode, 0, result.stderr.toString());
  return result.stdout.toString().trim().split("\n");
}

test("main pushes publish the same immutable commit used by the binary, outside stable latest", () => {
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  const version = run(build.replace(/^\s*bun run scripts\/build\.ts.*$/m, 'printf "%s\\n" "$version"'), "branch", "main", "push");
  const release = run(publish.replace(/^gh release create.*$/m, 'printf "%s\\n" "$tag" "${flags[@]}"'), "branch", "main", "push");
  assert.deepEqual(version, [`main-${sha}`]);
  assert.equal(release[0], version[0]);
  assert.ok(release.includes("--prerelease"));
  assert.ok(release.includes("--latest=false"));
  assert.match(publish, /--target "\$GITHUB_SHA"/);
});

test("version tags keep stable releases, while manual builds do not publish", () => {
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  const version = run(build.replace(/^\s*bun run scripts\/build\.ts.*$/m, 'printf "%s\\n" "$version"'), "tag", "v1.2.8", "push");
  const release = run(publish.replace(/^gh release create.*$/m, 'printf "%s\\n" "$tag" "${flags[@]}"'), "tag", "v1.2.8", "push");
  assert.deepEqual(version, ["1.2.8"]);
  assert.deepEqual(release, ["v1.2.8"]);
  assert.equal(workflow.jobs.publish!.if, "github.event_name == 'push'");
  assert.deepEqual(run(build.replace(/^\s*bun run scripts\/build\.ts.*$/m, 'printf "%s\\n" "$version"'), "branch", "main", "workflow_dispatch"), ["dev"]);
});
