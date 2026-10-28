# Development

[Back to the README](../README.md)

The server is written in TypeScript for Bun. It talks to T3 Code and exposes a local API. It also serves the React interface, which is in `web/`.

## Bun

You need Bun 1.4 or later. The CI uses Bun 1.4.2.

```sh
bun install
bun run dev     # hot reload of the server and the interface
bun start       # no reload
bun run demo    # demo mode, with made-up data
bun run build   # single binary in dist/t3-dashboard
```

- A version that Bun starts has the name `dev`. It does not look for updates automatically and does not contact GitHub at startup.
- `install` and `update` refuse to run outside the compiled binary. The service always points to this binary.

## Demo mode

`bun run demo` starts the dashboard with made-up data: projects, agents, conversations, Linear tickets and routines. It does not contact T3 Code or Linear. The screenshots in `docs/screenshots/` come from this mode. Start it again to make new screenshots after a change to the interface.

## Publish a release

1. Push a `v*` tag, for example `v0.3.0`.
2. The `release.yml` workflow builds the 5 binaries: macOS arm64 and x64, Linux x64 and arm64, Windows x64.
3. The workflow writes `SHA256SUMS` and creates the GitHub release. A tag with a hyphen (`v1.0.0-rc.1`) gives a prerelease.

A manual run of the workflow builds the binaries but does not publish a release.

## Checks

```sh
bun run check       # types and tests, server and interface
bun run smoke       # builds the binary and checks that it serves the interface
bun run contracts   # reads T3 Code, Linear and GitHub, writes nothing
```

- The CI (`ci.yml`) runs `bun run check` and `bun run smoke` on each PR and on `main`.
- No test contacts T3 Code. `bun run smoke` uses a temporary folder and a closed port in place of T3.
- `bun run contracts` contacts the real systems in read-only mode: see [contracts.md](contracts.md).

### Manual checks

These actions write to the real T3 Code. Do them once after each T3 update.

1. Create an agent with New Agent.
2. Send a message on an idle thread. During a run, queue a message: make sure that it appears in "Up next" and that T3 Code sends it when the turn ends. Queue another one, then edit it, send it with the send icon and remove it. Stop a run with a queued message, then click the send icon.
3. Stop a run.
4. Answer an approval with each of the 3 buttons.
5. Answer a question, then click "Dismiss".
6. Make sure that an agent that starts or finishes moves to a different card in the Agents tab without a page reload.
7. Delegate a task from a conversation, then click "Stop" next to its row. In T3 Code, make sure that the task and its child thread are stopped. Make sure that the button disappears.
8. Start a background shell command from a conversation, then let the run finish. Make sure that the composer "Stop" button stays visible. Click it, or the button on the task row. In T3 Code, make sure that the task is stopped. The dashboard then stops all background tasks of the conversation.
9. In the Agents tab, make sure that the "Automations" column lists the T3 Code scheduled tasks (`scheduledTasks.list`). An old T3 version shows an error in the column, and the grid continues to work.
10. Type "Reminder: in 2 minutes, say hello" in the column field, then send it. Make sure that the agent creates the task with `schedule_task`, and that the thread leaves the grid. After the run, make sure that the task is paused and that the reminder row shows "Finished".

## Architecture

The code has three parts: the server (`src/`), the interface (`web/src/`) and the contract between the two (`shared/`). The tests have the same structure in `test/` and `web/test/`.

### Server (`src/`)

| Folder | Contents |
| --- | --- |
| `main.ts` | Entry point. It reads the arguments and starts the correct command. |
| `app/` | Composition root. `start.ts` creates the real clients and connects them. `deps.ts` gives the real access to the disk and to processes. |
| `cli/` | Commands that run one time: arguments, installation, service, binary update. |
| `config/` | Environment variables, paths, version and dashboard files (Linear key, token, PID, automation threads). |
| `server/` | HTTP, SSE and static site. The router reads and validates the requests (`validate.ts`), then calls the domain. `htmlRender.ts` applies the theme to the `html_render` pages. |
| `domain/` | Rules and state: sync with T3, thread sorting, thread detail, actions, token, Linear board, settings, updates, automations, project icons, models. |
| `integrations/` | All calls to another system: T3 Code, Linear and GitHub. Each response goes through a schema. |

### Interface (`web/src/`)

| Folder | Contents |
| --- | --- |
| `api/` | Local API client, event stream (`useDashboard`) and `ApiContext`. `useApi()` gives the real API, unless an `ApiProvider` gives a different one. |
| `lib/` | Functions and components that more than one screen uses. |
| `features/` | One folder for each screen: `agents`, `desk`, `conversation`, `board`, `settings`, `setup`, `update`, `new-thread`. |
| `ui/` | Base components, tooltips and animations. See `web/src/ui/README.md`. |

### Contract (`shared/`)

`shared/api.ts` re-exports the types of each topic: `threads`, `connection`, `events`, `requests`, `linear`, `settings`, `automations`. `limits.ts` contains the shared limits (images, message size, runtime modes). `status.ts` contains the thread status model. `events.ts` gives the list of event types: the interface subscribes to this list.

### Import rules

The `test/architecture.test.ts` test reads the imports and blocks a forbidden dependency.

- `shared/` imports nothing.
- `config/` imports only `shared/`.
- `main.ts` imports `app/`, `cli/` and `config/`.
- `integrations/contract.ts`, `integrations/errors.ts` and `integrations/drift.ts` (contract report) import only each other.
- An integration imports `config/`, `shared/` and these three files. It does not import the domain, the server or a different integration.
- `domain/` imports `shared/`, `config/` and `integrations/`. It does not import `server/`, `app/` or `cli/`.
- `server/` imports `shared/`, `domain/`, `config/` and `integrations/errors.ts`. It goes through the domain to talk to T3 or Linear.
- `cli/` imports `config/`, `integrations/github/` and `integrations/errors.ts`.
- `app/` imports everything.
- `ui/` imports only `ui/`. One exception: `Dropdown.tsx` and `Popover.tsx` import the menu logic from `lib/dropdown.ts`.
- `lib/` imports `ui/`, `api/` and `shared/`. `api/` imports only `shared/`.
- A screen imports `lib/`, `api/`, `ui/` and `shared/`. It imports a different screen only through a link in the test list, for example `board` to `new-thread`.
- The interface never imports `src/`.

A second test (`test/integrations/boundary.test.ts`) blocks `fetch`, `WebSocket` and process launches outside `integrations/`. Only `app/start.ts` and `app/deps.ts` have an exception.

### Errors

- An integration throws an `IntegrationError`: system, type (`unreachable`, `refused`, `protocol`, `not-authenticated`) and message.
- The domain throws a `DomainError`: `invalid`, `not-found` or `conflict`.
- `toHttp(error)` in `server/httpError.ts` gives the HTTP code: 400, 404 or 409 for the domain, 400 for a refused Linear key, 502 for the other integration errors. A different error gives 500 and goes into the log.
- An error message never contains a key, a token or a response body.

## Security

- The T3 token and the Linear key stay on the server. The browser never sees them.
- The server listens only on `127.0.0.1`.
- Each request checks the `Host` and `Origin` headers: `127.0.0.1`, `localhost` or a name from `T3_DASHBOARD_ALLOWED_HOSTS`.
- The server sends no CORS header.
- Each `POST` requires the `application/json` type. This check blocks requests from a different site (CSRF). The body is 1 MB maximum, or 25 MB for a message with images.
- The responses prevent the display of the dashboard in a frame of a different site (`X-Frame-Options: DENY`).
- The server serves only the thread attachments and the files that an agent message cites. It shows images and videos. It serves other file types as downloads and never shows them.
- The server serves an `html_render` page with `Content-Security-Policy: sandbox`. Its scripts have an opaque origin and cannot call `/api`.
- The interface does not offer "Always accept": only `accept`, `acceptForSession` and `decline` go through.
