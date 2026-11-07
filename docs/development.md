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
- A dev version does not write the agent rules and does not run the automation guard, so it never changes your real tasks. Set `T3_DASHBOARD_AUTOMATION_GUARD=on` to test the guard.
- `install` and `update` refuse to run outside the compiled binary. The service always points to this binary.

## Demo mode

`bun run demo` starts the dashboard with made-up data: projects, agents, conversations, Linear tickets and routines. It does not contact T3 Code or Linear. The screenshots in `docs/screenshots/` come from this mode. Start it again to make new screenshots after a change to the interface. Each screenshot has a light file (`dashboard.png`) and a dark file (`dashboard-dark.png`), on a 1920x1080 screen with a device scale of 1.5 (the Dashboard one is 1920x1500, to show every card).

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

1. Create a session with New Session.
2. Send a message on an idle thread. During a run, queue a message: make sure that it appears in "Up next" and that T3 Code sends it when the turn ends. Queue another one, then edit it, send it with the send icon and remove it. Stop a run with a queued message, then click the send icon.
3. Stop a run.
4. Answer an approval with each of the 3 buttons.
5. Answer a question, then click "Dismiss".
6. Make sure that an agent that starts or finishes moves between the Running and Notifications cards of the Dashboard without a page reload. Make sure that a toast still opens its conversation. Make sure that Notifications lists what needs you first, then unread items with a dot, then recent read items, greyed. Click "Mark all read": make sure that the dots go and that the badge drops. Click "See all": make sure that every read agent shows with the "Settle all older than 3 days" button. Point at an unread item: make sure that only the check button shows and that it marks the item read. Point at a Running row: make sure that no button shows and that a click opens or focuses the session. Make sure that the run threads of a webhook task show like any session, with the calendar icon.
7. Delegate a task from a conversation, then click "Stop" next to its row. In T3 Code, make sure that the task and its child thread are stopped. Make sure that the button disappears.
8. Start a background shell command from a conversation, then let the run finish. Make sure that the composer "Stop" button stays visible. Click it, or the button on the task row. In T3 Code, make sure that the task is stopped. The dashboard then stops all background tasks of the conversation.
9. On the Automations page, make sure that the list lists the T3 Code scheduled tasks (`scheduledTasks.subscribe`). An old T3 version shows an error, and the Dashboard continues to work.
10. Type "Reminder: in 2 minutes, say hello" in the New Automation form or in a conversation, then send it. Make sure that the agent creates the task with `schedule_task`, and that the run thread shows in the Dashboard and Sessions lists with the calendar icon. Make sure that the task has no self-disable step in its prompt. After the run, make sure that the dashboard paused the task and that the reminder row shows "Finished".
11. Run a task with commands, a file change, a to-do list and a subagent. Make sure that the steps form a group that closes after the run. Open a command and a file change: make sure that the output, the exit code and the diff show. Open the "2 subagents" header: make sure that the card shows one row per subagent with its logo, status dot, latest line and time, and that a click on the running row opens the child thread (T3 Code may refuse a message to it).
12. In a conversation, drop a PDF and a PNG on the message list (not on the composer): make sure that a dashed frame shows over the whole conversation while you drag, that the files become chips in the composer, and that each file is added once. Do the same on the composer. In a subagent thread and in a New Session dialog, make sure that the drop adds nothing. Paste an image, and attach a file with the paperclip. Make sure that each chip goes from "uploading" to ready, that the arrow stays disabled until then, and that removing a chip deletes the upload. Send, then make sure that the agent receives the files. Type `@` and a part of a file name: make sure that the list opens, that the arrow keys, `Enter`, `Tab` and `Escape` work, and that `a@b.com` opens nothing. Type `/` at the start: make sure that the provider commands list opens, and that `/` in the middle of a text opens nothing. Pick a command: make sure that `/name ` is inserted. Type `$`: make sure that the skills list opens, and that `$5` opens nothing. On an idle Claude thread over 200k tokens whose last turn is more than 70 minutes old, make sure that a button like `Compact 722k` shows (and none under 200k, on Codex, or right after a turn), that a click compacts without adding a chat message, and that it hides during a run. Press `Escape` with a list open (the list closes, the field keeps focus), then again (the field loses focus). With the cursor in the field, make sure that `Ctrl` + `1`, `2`, `3` switch tabs and `Ctrl` + `N` opens New Session.
13. In a conversation, type a text, attach a file and press `Ctrl+S`: make sure that the browser does not offer to save the page, that the composer empties and that a "Stash 1" button shows. Open it: make sure that the row shows the text. Stash again, then restore with the arrow keys and `Enter`: make sure that the text returns after the draft, that the file chip returns, that the message sends with the file, and that `Escape` closes the list. Delete an entry with "x": make sure that the list closes when the last one goes. Stash from another session, tab or device: make sure that the count and the list update at once, with no reload.
14. Point at a message: make sure that a copy icon shows, that it copies the Markdown text and that "Copied" shows (also over plain `http`, on the tailnet address). On a phone, make sure that the icons always show. Send a message and, before the first step, make sure that a "Working…" row shows.
15. After a finished run, click "Edit from here" on one of your messages (with an attachment, if you can). Cancel: nothing changes. Choose "Revert and keep changes", then (on another message) "Revert files too": in T3 Code, make sure that the thread rewinds the same way and that the files return only the second time. Make sure that the text and the attachments return to the composer. In a subagent row, click the row: make sure that the window shows the thread name, follows the run and stays after a reload. During a run, make sure that the icon is disabled.
16. In a new conversation and in New Session, open the model chip. Make sure that the panel opens above the chip, on the Favorites tab, inside the screen (also at 375 px wide: the reasoning levels then go under the list). Search for a model and pick one with the arrow keys and `Enter`: make sure that the chip changes, that the panel closes and that the rows show no shortcut. Click a model that has options: make sure that the panel closes too. Open the panel again and pick a reasoning level and "Fast" on a model that has it: make sure that the chip shows the level and a bolt, and that T3 Code shows the same settings. Change the access mode in the footer, then press `Escape` twice (menu, then panel).
17. In demo mode (`bun run demo`), open the Automations page. Make sure that one list shows a row per task with three lines (name and kind, schedule and next run, last run), newest run first, with paused and finished rows dimmed. Open a signed webhook task: make sure that the side sheet has a "Copy webhook URL" button, and that a paused unsigned one has none; the "⋯" menu of the row has the same item. Click the button: make sure that the icon turns into a check and that the clipboard holds the demo URL. Make sure that no row shows the URL as text. Open New Automation and create one of each kind: the new row appears in the list. Edit one of each kind from its sheet or its "⋯" menu: make sure that the form is prefilled and that the changes show in the row. For a webhook with a typed secret, make sure that the sheet shows no secret, and that the field is empty after the send.
18. With the real T3 Code, create a routine (interval and fixed time), a reminder and a webhook from the form. Make sure that no thread opens. Reminder: make sure that the row shows the chosen date and time (time zone), then that the dashboard pauses the task after its run. Webhook (T3 Connect on): copy the URL, send a signed test delivery, and make sure that a thread opens. Edit each one from its sheet: make sure that the form shows the stored values, that a changed prompt, schedule, model and access mode are saved, and that the sheet shows the model icon and name. Edit the webhook with an empty secret: make sure that the URL, the filters and the signature check still work.
19. Agent rules and the guard. Use a temporary `CLAUDE_CONFIG_DIR` and `CODEX_HOME`. Run `t3-dashboard install`: make sure that both files have the block between the markers and that your text is unchanged. Run it again: make sure that nothing changes. Run `uninstall`: make sure that the block is gone. Then, with the real T3 Code, create a task in a worktree (for example with `schedule_task`): make sure that the dashboard moves it to the project folder, and that a finished reminder gets paused.
20. Send a message with a PNG and text, then one with only a PNG, and one with a PDF, an HTML file and a ZIP. Make sure that, in your messages, the images and file chips sit inside the bubble above the text (the bubble exists with no text). Make sure that, in an agent message with attachments, they sit above the text with no bubble. Click an image, the PDF, the HTML file and a text file: make sure that each opens the preview dialog (the image large, the others in a frame), that "Download" saves the file and "Open in new tab" opens it, and that `Escape` and a click outside close the dialog. Make sure that the ZIP downloads with no dialog. Queue a message with an image during a run: make sure that its image opens the same dialog. Click an image that an agent cites (`![x](/abs/path.png)`): make sure that the same dialog opens. Load an image in the last message: make sure that the list stays at the bottom.
21. Without a Linear key, open Dashboard: make sure that there is no Linear card and no empty slot, also in edit mode. In Settings, connect the real key: make sure that the Linear card shows. Make sure that the Urgent, Newly assigned, Mentions and Due counters match Linear (Due counts overdue and the next 2 days). Make sure that the feed holds at most 5 rows, with the unread inbox items first. Mention yourself from another account: make sure that the row shows after "Refresh" or within 2 minutes. Read it in Linear: make sure that it leaves the card at the next read. Click a row: make sure that Linear opens the issue (a comment mention opens the comment). Point at a row of an issue with no session, then click the robot button: make sure that the New Session window opens with the issue, and that the button leaves the row once the session exists. On another issue of the same team, make sure that the window selects the same project. Hide the card in edit mode, reload, then show it again: make sure that the place and the width stay. Disconnect Linear: make sure that the card leaves the Dashboard.
22. Sidebar and Dashboard. Collapse the sidebar with its button, reload: make sure that it stays collapsed and that the icons show a tooltip. Make sure that `Ctrl+B` collapses it, that `Ctrl+1` opens Dashboard and that the Dashboard entry and the bell show the Notifications count (`9+` above 9), also for an agent that waits and was already opened. Start a run on a thread that is not open: make sure that the Sessions entry counts it, and that it still counts it once the run finishes, until you read it. Make sure that the last row of the sidebar holds "Connected", Settings and the collapse button. In a 430 px wide window, make sure that a bottom bar (Dashboard, Sessions, Automations; Settings is in the header) replaces the sidebar, with badges on the icons, and that the Sessions composer stays above it. On Dashboard, make sure that the Usage card shows Codex, then Claude, with a tile per window (percent used, severity meter with an elapsed-time tick, reset countdown and pace caption, credits in the provider header). Compare a row with the Limits tab of T3 Code. Make sure that the Server card shows CPU, Memory and Disk tiles with meters, and a header line with the host, the system and the uptime. Compare the numbers with `top`, `free` and `df` (the home disk), and make sure that they move every 10 seconds. Make sure that the Activity card shows the three tiles and the 14-day chart (Turns, Spend, Tokens). Choose "last 30 days", then "last 90 days" in its menu: make sure that the tiles and their changes update, that the heading reads "Last 30 days" then "Last 13 weeks" with 30 then 13 bars, and that a reload keeps the choice, and that the Running, Linear and Notifications cards show. At 1280 px, make sure that the Notifications panel sits on the right, stays in view while the page scrolls, that the bell closes and opens it, that the cards then widen, and that the state survives a reload. At 1000 px and at 850 px (a phone in landscape), make sure that the panel is closed at first and never sits above the cards. Click the bell: make sure that a sheet at most 380 px wide slides in from the right (about 200 ms, none with reduced motion) under the header, down to the bottom of the screen. At 430 px, make sure that the panel is closed at first. Tap the bell: make sure that a sheet as wide as the screen slides in under the header and above the bottom bar, that the header stays usable, that a backdrop dims the page, and that the page behind does not scroll. Make sure that a tap on the backdrop, `Esc` and the bell close it, that focus goes back to the bell, and that the sheet is closed after a switch to Sessions and back. Make sure that Edit layout removes the sheet. With a layout saved in the old `{left, right}` shape, make sure that the default layout shows. With an old T3 Code (no `usageLimits` in `server.getConfig`), make sure that the Usage card says that it does not report limits. With an old T3 Code (no `server.getUsageSummary`), make sure that Spend shows "—" and a reason, and that the Dashboard cards still work.
23. Header and Dashboard layout. Make sure that the header is about 48 px high on one line. Make sure that Sessions shows the list toggle (wide screen), the layout toggle and New Session, Automations only New Automation and Dashboard the bell, then Edit layout, and that `Ctrl+N` and `Ctrl+Shift+N` still open their dialog on every page. In a 430 px wide window, make sure that the header shows the page button as an icon, a search button, and that the targets are 44 px high. On Dashboard, click "Edit layout": make sure that the button becomes "Done" with "Reset" before it, that the bell and the panel are gone, that each card has a bar, and that the cards do not react to clicks. Drag a card by its handle between two cards. Use the arrow buttons to move a card up and down. Hide a card, then show it from the "Hidden cards" list. Hide the Server card: make sure that the requests to `/api/server-stats` stop, and that they start again when you show it. Reload: make sure that the layout stays. Click "Reset": make sure that the default layout returns.
24. Sessions. Start a run in T3 Code on a thread that is not open: make sure that no column opens and that the list shows it running. Open 8 sessions one after another: make sure that each opens at the right end, that the strip scrolls sideways, that the columns are at least 380 px wide with a hairline between them and no gap. With 2 sessions, make sure that the two columns share the full width. Click the layout button ("Switch to grid view"): make sure that two sessions stack in each column and that an odd last session fills its column. Reload: make sure that the view stays. Press `←` and `→` (and `↑` `↓` in grid view): make sure that the focus moves and the column scrolls into view. Press `Ctrl+F` while the strip is scrolled: make sure that the session fills the page, and that `Esc` leaves it. Make sure that the list panel groups the threads by project with a count badge, that a fold and the flat view stay after a reload, that a project with no listed thread is a muted row at the end with no count and no chevron (and that "Collapse all projects" ignores it), that open threads have the accent bar and a bold title, closed ones a muted title, and the focused one a filled row, and that a click on a row opens or focuses its column and scrolls it into view. Point at an open row and click its cross: make sure that its column closes and the row stays, muted. Click "+" on a project: make sure that New Session opens with that project. Make sure that the list has a slim top band (add project, collapse/expand all, view toggle and close all on the right) and no bottom band, and that the page header buttons are, in order: list toggle, layout toggle, New Session. Click "Collapse all projects": make sure that every project folds and the button becomes "Expand all projects"; click it and make sure that all open. Click "Hide the list" in the page header: make sure that the list disappears with no rail and that the button becomes "Show the list"; reload, and click it. In a 430 px wide window, make sure that Sessions shows the list with the bottom bar, that the header has New Session and Search only (no list button), and that the band has the collapse/expand all, view toggle and close all. Tap a row: make sure that the session fills the screen with no bottom bar, that the back arrow returns to the list, and that a swipe moves between open sessions. Open a session from the Dashboard: make sure that it opens on the whole screen. Send a new message to it: make sure that the column comes back
25. Add project (demo mode). In Sessions, click "Add project" in the list band: make sure that the form opens with `~/` and lists the demo folders. Type `~/src/new-thing`: make sure that the button reads "Create & Add" and that the form says that the folder will be created. Click it: make sure that the form closes and that "new-thing" shows as a muted row at the end of the list, with no count. Add the same folder again: make sure that no second row appears. Type the path of a file: make sure that the button is disabled. Open New Session, open the project list and choose "New project…": make sure that the form replaces the window, and that after the add the window returns with the new project selected and the text that you typed kept.
26. Edit and delete a project (demo mode). Point at a project row in Sessions: make sure that a "…" button shows before "+" (on hover, always on a touch screen) and that a thread of an unknown project has none. Open it: make sure that the menu has "Edit project" and "Delete project", and that Escape closes it. Choose Edit: make sure that the title is prefilled, that there is no folder field and that Save is off. Change the title and click Save: make sure that the row renames. In the icon picker, choose an icon, a color, an emoji, a monogram, then "Default": make sure that the preview and the row follow after Save. Choose Delete: make sure that the text gives the session count and that the button is red. Click it: make sure that the project and its sessions leave the list.
27. Automation badge. In demo mode, make sure that the Automations entry shows a number and a red dot (a failed run is unread). Open one unread run from the "Run history" of a task sheet: make sure that the number drops. Open the Automations tab only: make sure that the number stays. Make sure that run sessions show the calendar icon in the Dashboard lists, the Sessions list, the toasts and the search (⌘K).
28. Automation list, sheet and controls. In demo mode, make sure that each row shows the project, and that the last run is a pill like the Dashboard rows (green Succeeded, red Failed, blue Running, amber Waiting). Open the "⋯" menu of a row and of a project row in Sessions: make sure that they look the same, with no separator. Choose each filter: make sure that Unread shows a count, and that an empty filter shows a centered icon and message ("All caught up" for Unread). Choose each sort, Project included (grouped under project headers), reload: make sure that the filter and the sort stay. Type in the search field. Click a row: make sure that a sheet slides in from the right with the title, the schedule, the buttons "Run now", "Edit" and "Delete" (red) and no menu, the facts, the prompt and the "Run history" (with "Session archived" for an archived run), and that `Esc`, the backdrop and the close button close it. Move a row switch: make sure that it moves at once and that the next load keeps it. Click "Run now": make sure that the button shows a spinner and stays disabled while the run is "Running". With a server that fails the call, make sure that an error shows and the switch moves back. In a 430 px wide window, make sure that the toolbar wraps, that the sheet fills the width above the bottom bar and that the row buttons stay in reach.

## Architecture

The code has three parts: the server (`src/`), the interface (`web/src/`) and the contract between the two (`shared/`). The tests have the same structure in `test/` and `web/test/`.

### Server (`src/`)

| Folder | Contents |
| --- | --- |
| `main.ts` | Entry point. It reads the arguments and starts the correct command. |
| `app/` | Composition root. `start.ts` creates the real clients and connects them. `deps.ts` gives the real access to the disk and to processes. |
| `cli/` | Commands that run one time: arguments, installation, service, binary update. |
| `config/` | Environment variables, paths, version, dashboard files (Linear key, token, PID, automation threads, news settings) and the agent rules block. |
| `server/` | HTTP, SSE and static site. The router reads and validates the requests (`validate.ts`), then calls the domain. `htmlRender.ts` applies the theme to the `html_render` pages. |
| `domain/` | Rules and state: sync with T3, thread sorting, thread detail, actions, token, Linear board, settings, updates, automations (and the guard that moves tasks out of worktrees and pauses reminders), the news, project icons, models, usage, provider limits, server stats. |
| `integrations/` | All calls to another system: T3 Code, Linear and GitHub. Each response goes through a schema. |

### Interface (`web/src/`)

| Folder | Contents |
| --- | --- |
| `api/` | Local API client, event stream (`useDashboard`) and `ApiContext`. `useApi()` gives the real API, unless an `ApiProvider` gives a different one. |
| `lib/` | Functions and components that more than one screen uses. |
| `features/` | One folder for each screen or part of a screen: `dashboard`, `shell`, `automations`, `sessions`, `conversation`, `settings`, `setup`, `update`, `new-thread`, `notifications`, `switcher`. |
| `ui/` | Base components, tooltips and animations. See `web/src/ui/README.md`. |

### Contract (`shared/`)

`shared/api.ts` re-exports the types of each topic: `threads`, `connection`, `events`, `requests`, `linear`, `settings`, `automations`, `usage`, `providerLimits`, `serverStats`, `news`. `limits.ts` contains the shared limits (images, message size, runtime modes). `status.ts` contains the thread status model. `guards.ts` contains the checks for untrusted values (request bodies, files, browser storage). `events.ts` gives the list of event types: the interface subscribes to this list.

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
- A screen imports `lib/`, `api/`, `ui/` and `shared/`. It imports a different screen only through a link in the test list, for example `dashboard` to `new-thread`.
- The interface never imports `src/`.

A second test (`test/integrations/boundary.test.ts`) blocks `fetch`, `WebSocket` and process launches outside `integrations/`. Only `app/start.ts` and `app/deps.ts` have an exception.

### News

The News page uses one T3 routine that the dashboard owns. `domain/news.ts` creates or updates it when the user saves the settings. It stores the task id in `news.json` in the config directory. If the task is gone from T3, the next save creates it again.

The agent writes one Markdown file for each day, `news/YYYY-MM-DD.md`, in the config directory. The server lists only real files with this name (no symlinks) and cuts an article at 512 KB. Use `T3_DASHBOARD_CONFIG_DIR` for a preview: it gets its own folder and its own task, which you must delete after the test.

Every 60 seconds `news.sweep()` archives the finished run threads of this task, when an article is newer than the thread. A failed or empty run stays visible. Demo mode keeps the articles in memory and does not sweep.

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
- The server serves only the thread attachments and the files that an agent message cites. It shows images and videos. With `?inline=1` it also frames a PDF and a text file (served as plain text, in a sandbox). It serves other file types as downloads and never shows them.
- The server serves an `html_render` page with `Content-Security-Policy: sandbox`. Its scripts have an opaque origin and cannot call `/api`.
- The interface does not offer "Always accept": only `accept`, `acceptForSession` and `decline` go through.
