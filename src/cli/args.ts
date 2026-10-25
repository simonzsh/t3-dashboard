import { parseArgs as parseFlags } from "node:util";

export type Command = "start" | "install" | "uninstall" | "update" | "version" | "help";
export interface Args {
  command: Command;
  port?: number;
  log?: string;
  open: boolean;
  check: boolean;
}

export const USAGE = `Usage: t3-dashboard [command] [options]

Commands:
  start       Run the dashboard in the foreground (default)
  install     Start the dashboard at login, now and on every login
  uninstall   Stop and remove the service (keeps the config)
  update      Install the latest release

Options:
  --port <n>  Port to listen on (beats PORT)
  --log <f>   Append the output to a file (start)
  --no-open   Do not open the browser (install)
  --check     Only look for a new release (update)
  -v, --version
  -h, --help
`;

const COMMANDS = ["start", "install", "uninstall", "update"] as const;

/** Returns the parsed arguments, or `{ error }` for a usage error. */
export function parseArgs(argv: string[]): Args | { error: string } {
  let parsed;
  try {
    parsed = parseFlags({
      args: argv,
      allowPositionals: true,
      options: {
        port: { type: "string" },
        log: { type: "string" },
        "no-open": { type: "boolean" },
        check: { type: "boolean" },
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return { error: (error as Error).message };
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) return { error: `Unexpected argument: ${positionals[1]}` };
  const name = positionals[0] ?? "start";
  if (!COMMANDS.includes(name as never)) return { error: `Unknown command: ${name}` };

  const args: Args = { command: values.version ? "version" : values.help ? "help" : (name as Command), open: !values["no-open"], check: values.check ?? false };
  if (values.port !== undefined) {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: `Invalid port: ${values.port}` };
    args.port = port;
  }
  if (values.log !== undefined) args.log = values.log;
  return args;
}
