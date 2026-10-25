import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { target: { type: "string" }, outfile: { type: "string", default: "dist/t3-dashboard" }, version: { type: "string", default: "dev" } },
});

// Autoload is off so a .env or bunfig.toml in the daemon's cwd cannot change it.
const args = [
  "build", "--compile", "--minify",
  "--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig",
  "--define", `BUILD_VERSION=${JSON.stringify(values.version)}`,
  "--production",
  ...(values.target ? ["--target", values.target] : []),
  "src/main.ts", "--outfile", values.outfile!,
];
const build = Bun.spawnSync([process.execPath, ...args], { stdout: "inherit", stderr: "inherit" });
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
