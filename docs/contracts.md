# Contract checks

[Back to the README](../README.md)

`bun run contracts` makes sure that T3 Code, Linear and GitHub still send and accept the fields that the dashboard uses. The script only reads. It sends no command, creates no token and changes nothing in Linear.

## What the script checks

| System | Check |
| --- | --- |
| `t3` | `server-runtime.json` contains `origin` and `serverVersion`. |
| `t3` | `POST /api/auth/websocket-ticket` gives `{ ticket }`. This ticket has a short lifetime, as in normal use. |
| `t3` | `server.getConfig` passes the `RawConfig` schema. The orchestration protocol is `2`. Each runtime mode is known. |
| `t3` | `orchestration.subscribeShell`: the script reads the stream until `synchronized`, then stops it. Each item passes the `ShellItem` schema. Each thread status is known. |
| `t3` | `scheduledTasks.subscribe`: the first snapshot passes the `ScheduledTasksResponse` schema. A T3 version without this method gives "could not run". |
| `t3` | `GET /api/orchestration/threads/{id}` for 3 threads maximum. Each response passes the `ProjectionResponse` schema. |
| `t3` | The 8 RPC tags of the dashboard exist in the T3 web client. |
| `t3` | The write commands (see below). |
| `linear` | `{ viewer { id } }`, then one page of assigned tickets, with the board query. Only if a key exists. |
| `github` | The latest release has a `tag_name` in version format. Its `SHA256SUMS` file contains a SHA-256 sum for each of the 5 binaries. The script downloads no binary. |

The schemas are in `src/integrations/*/schemas.ts`. The script uses the same schemas as the dashboard.

### T3 write commands

The script never runs a write command: `thread.create`, `message.dispatch`, `run.interrupt`, `subagent.stop`, `thread.stop`, `queued-message.promote-to-steer`, `queued-run.start`, `queued-run.edit`, `queued-run.cancel`, `runtime-request.respond`, `thread.user-input.dismiss`, `thread.model-selection.set`, `thread.runtime-mode.set` and image upload. It does a static comparison:

1. It reads the T3 version in `server-runtime.json`.
2. It reads the `~/.t3/runtime/versions/<version>/client/assets/*.js` files as text. It does not import or run this code.
3. It finds the structure of each command from its `type` literal. It marks each key `required` or `optional`, and gives the list of accepted values if there is one.
4. It builds the commands with the real builders in `src/integrations/t3/commands.ts`.
5. It compares the two results, then compares the structures with `contracts/t3-commands.snapshot.json`.

The minified names change with each T3 version. The script does not use them. If it cannot read the structures, it gives "could not run", not "breaking".

The `test/integrations/t3/contracts.test.ts` test compares the dashboard commands with the snapshot, without T3. It is part of `bun run check`.

## Run the script

1. Start T3 Code.
2. Start the dashboard one time: it saves its token in `~/.config/t3-dashboard/auth.json`.
3. Run `bun run contracts` at the root of the repo.

The script reads its configuration from the existing dashboard files:

- T3 token: `~/.config/t3-dashboard/auth.json`, or the file in `T3_DASHBOARD_TOKEN_FILE`. The script never creates or renews a token.
- Linear key: `LINEAR_API_KEY`, else `~/.config/t3-dashboard/linear.json`. Without a key, the script skips Linear.
- GitHub: no authentication.

## Read the report

Example:

```
t3 (version 0.1.2): CHANGED, 8 checks
  - breaking: snapshot run.interrupt.runId: optional, now required
  - could not run: thread projection: unreachable
linear: SKIPPED, no Linear key is configured
github: OK, 2 checks

Result: breaking change (exit 1)
```

- One line for each system: `OK`, `CHANGED`, `COULD NOT RUN` or `SKIPPED`, then the number of checks.
- `breaking`: a field that the dashboard reads or sends has changed. The line gives the field path, the expected type and the received type.
- `could not run`: a check could not run (T3 stopped, token refused, no network, unreadable bundle).
- Threads have a number, never a name.

The report never contains a value: no title, no token, no key, no personal path. It contains only field paths, types and T3 enum values. You can copy it into a public ticket.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | No change. A skipped system does not change the code. |
| `1` | At least one `breaking` change. |
| `2` | No `breaking` change, but at least one check could not run. |
| `64` | Unknown option. The script runs no check. The only option is `--update-snapshot`. |

## After a T3 update

1. Run `bun run contracts`.
2. If the report gives `snapshot` lines, read the T3 release notes.
3. Correct the code if a sent or read field has changed: `src/integrations/t3/schemas.ts`, `src/integrations/t3/commands.ts`.
4. Run `bun run contracts --update-snapshot`. The script writes `contracts/t3-commands.snapshot.json` only if it could read all the commands.
5. Read the snapshot diff, then open a PR with this diff.
