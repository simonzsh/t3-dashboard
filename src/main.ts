import { rmSync } from "node:fs";
import { parseArgs, USAGE } from "./cli.ts";
import { install, uninstall } from "./install.ts";
import { start } from "./start.ts";
import { DEFAULT_PORT, installDeps, updateDeps } from "./system.ts";
import { removeOldBinary, update } from "./update.ts";
import { VERSION } from "./version.ts";

const env = process.env;

const args = parseArgs(Bun.argv.slice(2));
if ("error" in args) {
  console.error(`${args.error}\n\n${USAGE}`);
  process.exit(2);
}

try {
  switch (args.command) {
    case "help":
      console.log(USAGE);
      break;
    case "version":
      console.log(`t3-dashboard ${VERSION}`);
      break;
    case "start":
      if (process.platform === "win32") removeOldBinary(process.execPath, (path) => rmSync(path, { force: true }));
      await start({ port: args.port, log: args.log, env });
      break;
    default: {
      // The service must point at the real binary, not at the Bun runtime.
      if (args.command !== "uninstall" && !Bun.isStandaloneExecutable) throw new Error("run the compiled binary");
      const deps = installDeps(env);
      if (args.command === "install") await install({ port: args.port ?? (Number(env.PORT) || DEFAULT_PORT), open: args.open }, deps);
      else if (args.command === "uninstall") await uninstall(deps);
      else await update({ check: args.check }, updateDeps(env));
    }
  }
} catch (error) {
  console.error(`t3-dashboard: ${(error as Error).message}`);
  process.exit(1);
}
