# Usage

[Back to the README](../README.md)

The dashboard has five pages: Dashboard, Sessions, Pull requests, Automations and News. A sidebar on the left lists them, with a search button (`⌘` + `K`). Its last row shows the connection state, Settings and a button that collapses the sidebar to icons (`Ctrl` + `B`). The theme, the accent color and the interface tint are in Settings. The sidebar remembers its state. The page header is one line: the title and a short description. Its button depends on the page: Sessions has a list toggle (wide screen), a layout button and New Session (`Ctrl` + `N`), Automations has New Automation (`Ctrl` + `⇧` + `N`), News has News settings and Run now, and Dashboard has the Notifications bell, with the number of unread items, then Edit layout. The two shortcuts work on every page. On a phone, a bar at the bottom of the screen replaces the sidebar: Dashboard, Sessions, Pull requests (shown as "PRs"), Automations and News. The header then shows the page buttons as icons (on Dashboard, the bell too), a search button and Settings. A dot on Settings shows that an update is ready.

## Dashboard

Dashboard opens first. At the top, the Usage card shows the usage limits of your providers (Codex, then Claude, then the other providers), read from T3 Code. Each provider has one tile per limit window (Session, Weekly, or a model-specific one). A tile shows the percent used and a meter. The meter fills with the percent used. It is blue below 75 %, amber from 75 % and red from 90 %. A thin tick shows the share of the window already elapsed. Under the meter, a caption gives the time to the reset and the pace (ahead of, on or under pace). When a provider has banked reset credits, its header shows their number with a ticket icon. The card header shows "Updated" with the time of the oldest provider check. The refresh button asks T3 Code to check the providers again (this takes a few seconds), then reads the limits: the time moves to "just now". The card also reads every minute, but this read only takes what T3 Code already knows. The Activity card comes next. It shows three numbers for the last 7 days, each with its change from the 7 days before. Click "last 7 days" next to the title to choose 7, 30 or 90 days. Each number then changes from the period before, of the same length. The browser keeps the choice (local storage key `t3-dashboard-activity-period`). The numbers are: turns (the runs of your T3 Code threads: the messages sent to agents, by you or by an automation), sessions with at least one turn, and spend (the API equivalent). Spend and tokens come from T3 Code and cover all usage on this machine, not only these threads. A chart shows turns, spend or tokens: for each of the last 14 days at 7 days, each of the last 30 days at 30 days, and each of the last 13 weeks at 90 days. Turns and sessions count only the threads that this dashboard knows: a long period can show fewer than the real number. Below it, the Server card shows the machine that runs the dashboard: three tiles with the CPU used (the percent busy since the last read, and the number of cores), the memory used (of the total) and the disk used (of the disk that holds your home directory). The meters use the same colors as the Usage card. The host name, the system and the uptime show next to the title. The right side of the header shows "Updated" with the time of the last read, and a refresh button that reads at once. The card also reads every 10 seconds while it shows. Each card is half or full width. Half cards stack in two columns with no gaps, so a short card sits right under the one above it, beside a taller card. A full card spans both columns and starts a new band below it. By default Activity is full width on top, with Usage on the left and Running, Server and Linear on the right. When the dashboard is narrower than 900 px, all cards stack in one column. The Notifications panel is on the right and is open by default. It stays in view while the page scrolls. The bell in the header opens and closes it. When the panel is closed, the cards take the full width. The browser remembers the panel state (`t3-dashboard-notifications` in local storage). On a screen 1200 px wide or less, there is no room for the column: the panel is a side sheet that slides in from the right, under the header. On a phone it is as wide as the screen and stops above the bottom bar. Between 701 and 1200 px it is at most 380 px wide. A dimmed backdrop covers the page: a tap on it, `Esc` or the bell closes the sheet, and the page does not scroll while it is open. The sheet is closed by default. It is not saved, and it closes when you leave Dashboard. On a phone, the cards stack in one column, band by band.

- Click "Edit layout" to move the cards. Drag a card by its header to any place in either column, or between bands and full cards. The arrow buttons move the card up or down in its column: use them with the keyboard or on a touch screen. At the top or bottom of a band, a card moves past the full card next to it. A full card moves past the band or card next to it. The width button switches a card between half and full width. The eye button hides the card. A list of hidden cards shows at the top, with a button to show each one. Notifications is not part of the layout, and edit mode hides it. A hidden card reads no data: Usage, Activity, Server and Linear stop their calls, and read again when you show the card.
- Click "Done" to leave edit mode. "Reset" restores the default layout. The browser saves the layout (`t3-dashboard-layout` in local storage), so each browser has its own. A layout saved by an older version is converted.

- If T3 Code is too old to report usage limits, the Usage card says so. If it is too old to report usage, the spend shows "—" and the reason. The rest of the Dashboard keeps working.

## Dashboard cards

Notifications and Running list your agents. Notifications is a panel, Running is a card. The Linear card shows what needs you in Linear. The Dashboard entry in the sidebar and the bell show the same number as the Notifications header: the agents that need you (waiting or failed, even once read) and the unread results. The Sessions entry shows the number of rows of the sessions list that run or are unread, open as a column or not, and an orange person icon when an agent waits for you. The Pull requests entry shows the number of open pull requests that you have not opened yet (see "Pull requests"). The Running card shows the number of running agents. `Ctrl` + `1` opens Dashboard.

- Notifications shows the 50 most recent items by last activity, newest first, whether settled or not. Read items remain visible without an age limit. This list is derived from live T3 sessions, with one item per session, and is not stored as a separate notification history. A newer item displaces the oldest when the list reaches 50. A status icon shows the kind: warning (waits for you), alert (failed), check (finished). Each item shows the title, one line of detail (what it waits for, the error, or the model), the project and the time. Items that need you or are unread have a tint and a hollow ring (the unread mark of the whole dashboard). The badge in the header counts them.
- Point at an unread item to see its one button: the check marks it read. An agent that waits or failed has no button: it still needs you. The Running card rows have no button. A click on a notification opens the conversation in Sessions and marks it read. `⇧` + click opens it in Sessions without leaving Dashboard.
- The "Mark all read" button of the header marks all unread results read.
- The panel has no "See all" or bulk settlement action. When nothing needs you, it says "Nothing needs you".
- Running lists the agents that work (its header shows a green dot and "Live": the list follows T3 Code with no delay), each with a pulsing dot, the model, the project and the time. A click opens the conversation in Sessions, or goes to it when it is already open.
- Linear shows what needs you in Linear (see [Linear](#linear)). It is not on the Dashboard until Linear is connected.
- Archived or deleted sessions and sub-agents do not appear. The sessions of automations (run threads of routines, reminders and webhooks) appear like any session, with a small calendar icon after the title (see [Automations](#automations)).
- The "Settle" button (box icon) settles an agent, as T3 Code does: it leaves the lists. It does not exist for an agent that works or waits.

The rows change status live, without a page reload. The toasts and the browser notifications still tell you when an agent waits or finishes. Phone alerts are another feature: see the bell in [Sessions](#sessions) and Alerts in the Connections tab of [Settings](#settings). A click on a toast opens the conversation.

### Clear caches

The trash button in the header of the Server card frees disk space. It is hidden on Windows. A click opens a dialog that lists each cache with the size it would free, and the total. Nothing is removed until you confirm. Afterwards the card says "Freed" with the size, names any cache that could not be cleared, and reads the stats again.

The server decides what to clear, from a fixed list per system. The request has no path and no option. The list is:

- Package caches: npm (`~/.npm/_cacache`), Yarn, pnpm and uv (`~/.cache/...` on Linux, `~/Library/Caches/...` on macOS), and the Bun install cache (`~/.bun/install/cache`, not the rest of `~/.bun`, which holds the `bun` program).
- Temp folders: `node-compile-cache` and `mongo-mem-*` in the system temp folder. Only entries that nobody changed for more than one hour are counted and removed.

These limits hold: the server never follows a symbolic link out of a cache, and it never touches worktrees, repositories, outputs, `~/.t3` or any other path. A cache that fails (for example a locked file) shows its error and the other caches still clear. Two clears at the same time share one run. The routes are `GET /api/cache-cleanup` (sizes) and `POST /api/cache-cleanup` (clear).

### Linear

The Linear card shows what needs you, at a glance. It needs a Linear API key: see [install.md](install.md#linear). Connect Linear in Settings. Until Linear is connected (no key, or a key that Linear refuses), the card is not on the Dashboard, and edit mode shows no slot for it. If you hid the card, edit mode still lists it under "Hidden cards".

- Four counters show the figures: Urgent (your open issues with the Urgent priority), Newly assigned (issues recently assigned to you, still unread in your Linear inbox), Mentions (unread mentions of you, in an issue or in a comment) and Due (your open issues due today or within 2 days, or overdue; the counter turns red and shows how many are overdue).
- Under the counters, a feed lists at most 5 rows, one line each and one row for each issue. The feed shows first the unread inbox items (newest first), then the overdue issues (the oldest due date first), then the urgent issues (the most recently updated first), then the issues due soon (the nearest due date first). A row shows an icon for its kind, the issue number and title, then the person who mentioned you or assigned you, and its age, or "overdue N d" or "due in N d". Click a row to open the issue in Linear. A comment mention opens the comment.
- The inbox comes from your Linear notifications of 3 types: mentions, comment mentions and assignments to you. The server reads the 50 newest. An item you read, archive or snooze in Linear leaves the card at the next read. With more than 50 unread items, the counters can show fewer than the real number. An assignment disappears when the issue is completed or canceled.
- The card reads again every 2 minutes while the Dashboard shows it. The server keeps the answer for 60 s. The "Refresh" button reads Linear again immediately.
- If Linear answers for your issues but not for the inbox, the Urgent and Due counters stay, Newly assigned and Mentions show "–", and a line says "Inbox not available". If Linear cannot be read at all, the card shows the error and a "Retry" button.
- When an issue is in your assigned issues, has no session yet, and you point at its row, a robot button shows on the right (on a touch screen it always shows). It opens the New Session window with the issue: choose the project, the model and the instructions, then create the session. The window selects the last project that you chose for the Linear team. The session opens in Sessions, and the button leaves the row. A session has the issue when its title contains the issue number, for example `ABC-123`. A session that you archive in T3 Code no longer counts.
- The browser keeps the project selection in its `localStorage`, not on the server.

## Sessions

Sessions shows your open conversations side by side. Each session is a column at least 380 px wide that fills the height of the page. When the columns do not fill the width, they widen to share it; when they need more room, the strip scrolls sideways. A hairline separates the columns.

- A list panel sits left of the columns. Its toolbar shows "Active sessions" beside the list controls. The archive button sits at the far right, after Close all sessions. It is hidden when no inactive sessions are eligible. It settles all eligible sessions inactive for more than 3 days, read or unread. The button opens a compact confirmation dialog with the session count, the inactivity threshold, and a short undo hint. Nothing is settled before confirmation. After confirmation, the dialog closes and sessions fly toward Settled in a rapid sequence capped at 1.5 seconds. Larger batches use shorter intervals. If requests take longer, settlement continues without further flights. Running sessions, background work, queued messages, pending requests, and already settled sessions are excluded. Gray count badges sit directly after the Active sessions and Settled titles. They count all sessions in each list, including rows in collapsed groups. On entry, both sections fade in with a short upward movement. Settled rows also fade in when you expand their section. Hover a session to settle it with the archive icon or unsettle it with the archive-and-up-arrow icon. The settle or unsettle action sits to the right of Close. Settle is hidden while a run, background work, a queued message, or a pending request needs attention. Unsettle remains available. These actions also appear on keyboard focus and stay visible on touch screens. A copy of the session flies toward the Settled bar, or toward Active sessions when you unsettle it. The row then appears in its new list. Neighboring rows slide into place. Reduced-motion settings disable these animations. It lists every thread that is not settled (a settled thread that runs or waits stays), without sub-agents. Automation sessions show with a calendar icon after the title. A bar sits at the bottom when collapsed. Click anywhere on the bar to expand or collapse it. When expanded, the bar moves up and the list appears below it. The list shows sessions settled in the last 24 hours, newest settlement first. The list starts collapsed and scrolls independently within half the panel height. Opening and closing use the same short transition as the side panels. Reduced-motion settings disable the transition. The cutoff uses the settlement time, not the last activity. Sessions without a settlement time stay out of this section. ⌘K finds older settled sessions.
  - Grouped view (default): one row per T3 Code project, with a chevron to fold it, its icon, the number of its threads that run or are unread (accent, the same rule as the Sessions entry: the project numbers add up to it) and the number of listed threads (muted). Projects with listed threads come first, then "Unknown project" rows, then the empty projects at the end: muted, with no count and no chevron to fold. An archived project shows only while it has a listed thread. In the grouped view each thread row shows the provider logo and the model; in the flat view it shows the project icon and name instead. Point at a project and click "+" to start a New Session in it. Flat view: one list, most recent first. A button in the list band, after collapse/expand all, switches the view.
  - Each row has a status mark (a pulsing dot when it runs, an orange person icon when it waits for you (a human is needed), a red alert circle when it failed, a hollow accent ring when it is unread: only "running" is a dot, so a yellow or red accent cannot be mistaken for waiting or failed), the title and "time · model". A thread open as a column has a thin accent bar on its left and a bold title, a closed one has a muted title, and the focused one a filled background. Click a row to open it as a column, or to focus its column and scroll it into view. Point at an open row to see a cross that closes its column; the thread stays in the list.
  - A slim band at the top of the panel has small icon buttons. The icon-only "Add project" button sits in the page header, just before "New Session". On the right of the list toolbar: "Collapse all projects" or "Expand all projects" (grouped view only), the view button (grouped or flat), and "Close all sessions", which closes every column with no confirmation and is hidden when no sessions are open. There is no band at the bottom.
  - The "Hide the list" button is in the page header (wide screen only), before the layout button; it becomes "Show the list" when the list is hidden. Each browser keeps the panel state, the view and the folded projects.
- A new session opens at the right end and scrolls into view.
- A session never opens by itself. It opens when you create it (New Session, a Linear ticket), click it in the list, a Dashboard row or a notification, or pick it with ⌘K. Every thread still shows in the list with its status. At most 100 sessions stay open.
- One button in the page header switches between the two views: its icon and tooltip name the view it switches to. Column view shows one session per column. Grid view stacks two sessions in each column, and the strip still scrolls sideways. Each browser keeps its choice.
- Each session header has two rows. The first holds the drag handle and title, then the state badge, full screen and close buttons on the right. The second holds the project on the left and session actions on the right: alerts, pull requests and T3 Code. The project name truncates before the controls shrink. The state badge shows running (with a pulsing dot), waiting or failed; done and idle show none. Drag the header onto another session to swap them. The dragged header keeps its original width and the point where you grabbed it.
- Close a session with the x button. It stays in the list; open it again from the list, the Dashboard or the switcher.
- An error of the dashboard in a session (a send or a load that fails) shows as one quiet red line at the top of that session, gone after 8 seconds or with its x. Errors of the whole dashboard keep the red banner at the top of the page.
- The server keeps which finished conversations you opened, for the Dashboard lists and the Dashboard badge, and the news articles and pull requests you opened, in `~/.config/t3-dashboard/seen.json`. A conversation read on one device is read on all of them. The focused session counts as read only while the dashboard shows and its window has the focus: in a background tab or an unfocused window, a session that finishes or waits stays unread and shows a notification.
- The bell in a session header sends alerts to your phone. It shows only when alerts are set up in Settings. Click it to turn the alert on (the bell rings, and its tooltip says "Alert on: click to turn off"). Each time the session starts to wait for you (an approval or an answer) or finishes (done, failed or cancelled), the server sends one alert. The bell stays on until you click it again, or until the session is archived or deleted. The alert works with no browser tab open. A tap on the alert opens the dashboard on that session. A bell that is on shows on every device. An alert that falls while the dashboard server is down is lost. The link `#/sessions/<id>` opens the Sessions page on that session, then the address becomes `#/sessions`.
- On a phone, Sessions shows the list on the whole page, with the bottom bar. Tap a thread to open it on the whole screen: the header and the bottom bar go, and the session header has a back arrow to the list. Swipe left or right to move to the next or previous open session. Closing the session goes back to the list. A session opened from the Dashboard, a notification or the search opens on the whole screen at once; the Sessions entry of the bottom bar shows the list. The layout button does not show on a phone. The view button, collapse/expand all and close all are in the list band; there is no hide button. After each swipe, dots show for a moment where the session sits among the open ones.
- The server keeps which conversations are open in Sessions in `~/.config/t3-dashboard/sessions.json`. Every device shows the same conversations, and an opened or closed session appears on the other open tabs at once. Each device keeps its own session order, focused session, full screen session, layout and Jump to history.

### Conversation

Each session contains a conversation.

- When T3 Code links pull requests to the session, or finds an open pull request for its branch, the header shows a pull request button. With one pull request, the button ("Open pull request #12") opens the Pull requests page on its diff. A hollow ring on its corner shows that you have not opened it yet. With several (a stack, for example), the button opens a menu: one line per pull request ("#12 acme/storefront – title", the title when T3 Code knows it), which opens its diff. A badge on the button shows the number of pull requests that you have not opened yet (the lines with a hollow ring); when you have opened them all, the button has no badge. The menu is at most 420 px wide: a long title ends with "…", and the number, the repository and the ring stay in view. Point at a cut title to read it in full. The newest pull request is at the top: the open pull requests come first, by creation date, then the others (merged or closed) in reverse order of T3 Code, which lists its links oldest first. A hollow ring (the unread mark of the whole dashboard) after a line shows an open pull request that you have not opened yet. A pull request that is merged, closed or not in your open list shows no ring. A stack layer that you removed in T3 Code does not show.
- Write a message and send it with `Enter`. During a run, the message waits in the "Up next" list (dashed border). T3 Code sends it when the turn ends.
- Under each queued message, three icons: "Send now" (the same arrow as Send), edit, remove. During a run, "Send now" steers: the message goes into the current run now. After a Stop, T3 Code holds the queue, and "Send now" starts a turn with this message.
- When editing a queued message, press `Enter` to save, `Shift+Enter` to add a line, or `Escape` to cancel. On touch screens, `Enter` adds a line; tap Save to save.
- Attach files with the paperclip, by drag and drop anywhere on the conversation (a dashed frame shows the drop area; it does not work in a subagent thread), or by paste. A chip shows each upload ("uploading", ready or "failed" with a retry button). Send waits for all uploads. The limits are those of T3 Code: 100 files, 10 MB for each image (PNG, JPEG, GIF or WebP), 50 MB for each other file and 80 MB of images in all.
- Type `@` after a space to search the files of the conversation folder. Use the arrow keys and `Enter` or `Tab` to insert `@path`. `Escape` closes the list.
- Type `/` at the start of the message to list the commands of the provider. Type `$` after a space to list its skills. The lists follow the thread folder. The menus work like the `@` list and insert `/command ` or `$skill `. Built-in T3 Code commands (`/model`, `/plan`, `/side`) are not in the lists.
- The Compact button shows the context size, for example `Compact 722k`. It appears as in T3 Code: on a Claude thread of 200k tokens or more (other agents use `/compact` or `/compress` from the `/` list) whose prompt cache has expired (70 minutes after the last turn by default), and never during a run. `/compact` stays in the `/` list at any size. Click it, or pick `/compact`, to compact the thread.
- Stash a draft: press `Ctrl+S` in the composer (`Ctrl`, also on a Mac). On a touch screen, tap the stash button next to Attach. The text and the ready attachments go to the stash and the composer empties. A "Stash" button with the count then shows next to Attach. Click it to open the "Stashed prompts" list: each row has the first line, the age, the conversation and the number of files. Click a row, or use the arrow keys and `Enter`, to restore it: the text goes after your draft and the files return as chips. The "x" deletes an entry and frees its files. `Escape` closes the list. The stash holds 20 prompts and drops the oldest. T3 Code 0.1.6 keeps its own stash in the browser only, so the two are separate. This one is in `~/.config/t3-dashboard/stash.json` and is the same on every device: a change shows at once in every open window. T3 keeps an unsent upload for 24 hours: a restored entry older than that gets its text back and a message names the files to attach again.
- `Escape` in the message field, with no list open, leaves the field and puts the focus on the conversation. The `Ctrl` shortcuts work in the field too. Press `Escape` again in Sessions to restore a full-screen session.
- Change the model, its options and the access mode with one chip in the composer. The chip shows the provider icon, the model, the reasoning level and a bolt when Fast is on. Click it to open the panel above it:
  - The panel opens on your favorites (or on the current provider when you have none). The left rail has the favorites (star) and one icon per provider. Type in "Search models..." to search all providers.
  - Click a model, or use `↑` `↓` and `Enter`: the panel closes. `Escape` also closes it.
  - The right column lists the reasoning levels of the model. "Default" marks the default level and a check marks the current one.
  - The footer has "Standard" and "Fast" when the model has a speed option, and the access menu ("Supervised", "Auto-accept edits", "Auto", "Full access") on the right.
  - A star on a model shows a T3 Code favorite. Change favorites in T3 Code: the dashboard does not change them.
- Stop a run with the "Stop" button.
- Answer an approval: "Accept", "Accept for session" or "Decline". The request shows above the message field. The dashboard does not offer "Always accept".
- Answer a question from the agent: it shows above the message field, one question at a time. Pick an option (click it or press its number), or type your own answer in the field. Then click "Next", and "Submit" on the last question. The cross dismisses the question when T3 allows it; the stop button stops the turn. The chevron hides the question.
- Follow the steps of the run in the conversation. Consecutive steps (reasoning, commands, tools, file changes, searches) form one group. The group of the active run shows its last 4 steps under "Working for …". Other groups are closed: click one to see its steps.
- Click a command to see its output and exit code. Click a file change to see its diff. Click a tool or a search to see its input and results. A note says when T3 Code cut a long text.
- A to-do list, a proposed plan and a notice (checkpoint, compaction, error) have their own block.
- Like T3 Code, a subagent has a row with its provider logo, title, latest line, status and time. Two or more subagents of one turn share a "N subagents" header that opens a card of rows. Click a row to open its thread in a session. The session takes its name from the thread, follows a running subagent, and stays open after a reload. Like T3 Code, it has no message field: a bar shows the model, the run time, "Runs on its own" and "Open parent", which opens the parent thread. `@` search there uses the folder of the parent thread. The stop icon stops a running subagent.
- Between your message and the first step, a "Working…" row shows while the run is active.
- Point at a message (or tab to it) to see a row of icons under it. On a touch screen, the row always shows. The copy icon copies the text of the message (Markdown) and shows "Copied".
- The "Edit from here" icon (your messages only) opens a dialog. Choose "Revert files too" to rewind the conversation to before this message and also undo the file edits of the agent, or "Revert and keep changes" to rewind the conversation only: your files stay as they are. In both cases your text and attachments return to the composer. The icon is disabled during a run. A message with no ready checkpoint before it has no icon.
- Files that you sent show under the message as chips: click one to download it.
- See the images and videos that the agent refers to in its messages.
- See the pages from the T3 Code `html_render` tool. The dashboard shows them in an isolated frame (sandbox), with the theme colors.

#### Conversation API

The web page uses these routes of the dashboard server.

| Route | Use |
| --- | --- |
| `GET /api/threads/:id` | The conversation: messages, queue, `steps` (the latest 400 steps of every run) and `stepsOmitted`. The timeline shows "N earlier steps not shown" when steps are left out. |
| `GET /api/threads/:id/items/:itemId` | The full detail of one step: command output, diff, tool input and output, full text. Long texts are cut. |
| `GET /api/threads/:id/commands?provider=` | Commands and skills of the provider for the `/` and `$` lists, as seen from the thread folder. |
| `GET /api/threads/:id/files?q=&limit=` | Files and folders for an `@` mention. The search folder is the worktree of the thread, or else the project root. |
| `POST /api/attachments` | Upload one file (`name`, `mimeType`, `dataUrl`). An image of 10 MB or less goes as an image, any other file of 50 MB or less as a file. |
| `POST /api/attachments/:attachmentId/delete` | Remove an uploaded file that was not sent. |
| `GET /api/stash` | The stashed drafts, newest first: `{ entries }`, each with `id`, `text`, `uploads`, `createdAt`, `threadId` and `threadTitle`. |
| `POST /api/stash` | Stash a draft: `{ text, uploads, threadId, threadTitle }`. Answers `{ entry, evicted }`: `evicted` holds the entries that the limit of 20 pushed out. |
| `POST /api/stash/:id/delete` | Remove an entry. `404` when it is gone already, for example restored on another device. |
| `POST /api/threads/:id/rewind` | Rewind to before a user message: `{ messageId, restoreFiles }`. Sends the T3 command `checkpoint.rollback` with the checkpoint of the run before the message. `409` during a run or without a ready checkpoint. A message has `rewindable: true` when it can be rewound. |
| `POST /api/threads/:id/messages`, `POST /api/threads` | Send `uploads` (the answers of `POST /api/attachments`) with the message. A message takes up to 100 attachments. `POST /api/board/assign` takes `uploads` too. |

`GET /api/threads/:id/attachments/:attachmentId` serves an attachment. A `.html` file is a rendered, themed page, unless the URL has `?raw=1`: downloads and "Edit from here" use `?raw=1`, so a file that you send is never shown as a page. With `?inline=1`, a PDF and a text file (`text/*` or JSON) show in the page instead of downloading; the preview dialog uses it. Any other type downloads.

Attachments show inside the message: in the bubble of your messages, above the text of an agent message. A click on an image, a PDF, an HTML file or a text file opens a preview dialog with "Download" and "Open in new tab". An image that an agent cites opens in the same dialog.

## New Session

The New Session button (key `N`) starts a new session.

1. Select a T3 project, or keep "No project". Without a project, the session goes into the "No project" project of T3 Code.
2. Write the task. The first line becomes the title of the session.
3. If necessary, change the model or the access mode, or attach files. `@` search does not work here: the thread does not exist yet.
4. Send. The conversation opens in Sessions.

- Every session starts with one T3 call, `orchestration.launchThread`, like the T3 Code client. T3 Code 0.1 or newer is needed; an older T3 Code gives the error "Starting a session needs T3 Code 0.1 or newer".
- `POST /api/threads` and `POST /api/board/assign` take one optional field, `workspace`, which is one of:
  - `{ "type": "root" }`: the current checkout, as it is (the default).
  - `{ "type": "root", "branch": "dev" }`: check out `dev` first. With `"create": true`, create `dev` first. A remote branch becomes a local tracking branch.
  - `{ "type": "existing_worktree", "worktreePath": "/…", "branch": "dev" }`: reuse the worktree where `dev` is already checked out.
  - `{ "type": "worktree", "baseRef": "main", "startFromOrigin": true }`: T3 Code makes a new worktree and a new branch from `baseRef`.
- A `workspace` other than `{ "type": "root" }` needs a project that has a folder. Without a project, the request gets `400`. An unknown project, or a project without a folder, gets `409`. A failed checkout starts no session.
- `GET /api/projects/:id/refs?query=&cursor=` lists the branches of the project folder, 100 at a time: `name`, `remote`, `current`, `isDefault` and `worktreePath` (the worktree where the branch is checked out). `GET /api/projects/:id/vcs` gives the current `branch` and `hasChanges`. A folder that is not a git repository answers `isRepo: false`.
- Under the project field, the window shows where the session runs. It shows only for a project that has a folder and is a git repository. It is hidden for "No project" and for a folder that is not a git repository.
  - "Current checkout" runs in the project folder. The branch picker is on the current branch. Pick another branch to check it out first (a remote branch becomes a local tracking branch). Pick a branch that another worktree holds to reuse that worktree. Type a name and choose "Create branch" to create it.
  - "New worktree" makes a new worktree and a new branch from the branch picked in "From". Turn on "From origin" next to the mode (shown when the project has a remote) to start from the remote branch. The choice of the project in T3 Code sets the mode that is first selected.
  - A note warns you when the checkout has uncommitted changes and the session switches or creates a branch: the changes move with it.
- The proposed model is the default model of the project. If there is none, it is the default model of T3 Code.
- The favorite models of T3 Code are at the top of the list.
- The browser keeps the last project that you selected.
- The last choice of the project list, "New project…", opens the Add project form in place of this window. After you add the project, the window comes back with the new project selected and your text kept.

## Add project

The "Add project" button of the Sessions list band (and "New project…" in the New Session window) adds a T3 project from a folder.

1. Type the folder: an absolute path (`/…`) or a path under your home folder (`~/…`). The form starts with `~/` and suggests the sub-folders as you type. Click a suggestion to complete the path.
2. Optional: type a title. When empty, the project takes the name of the folder.
3. Click "Add". When the folder does not exist, the button reads "Create & Add" and the folder is created.

If an active project already uses the folder, nothing is created. If that project is archived, it comes back. A path to a file is refused.

## Edit or delete a project

Each project row of the grouped Sessions list has a "…" button (next to "+"). It shows on hover, always on a touch screen. It opens a menu with "Edit project" and "Delete project".

- **Edit project** changes the title and the icon. Like T3 Code, it does not change the folder: add the new folder with "Add project" instead. The icon is a Lucide preset, an emoji (a preset or a pasted one) or a monogram of one or two letters, with a color; "Default" goes back to the monogram that T3 Code draws from the name. Save is off until something changes.
- **Delete project** asks first. It states the number of sessions that go with the project (settled ones included). T3 Code deletes the project and its sessions. The folder stays on disk. This cannot be undone.

## Automations

The Automations tab lists the scheduled tasks of T3 Code, with the history of their runs. It needs T3 Code to be connected. The list updates every 30 s while the Automations page is open, and every 2 minutes on other pages, while T3 Code is connected. It also updates at once when you come back to the page.

- One list shows every task, one row each, with three lines. Line 1: the name, the kind (Routine, Reminder, Webhook), "Paused" or "Finished", and a hollow ring when the latest finished run is unread (the unread mark of the whole dashboard; a filled pulsing dot means running). Line 2: the project, the schedule, then the next run ("Next in 3 h"; point at it to read the date; "Paused"; "On each delivery" for a webhook; nothing for a finished reminder). Line 3: the status of the last run as a pill, like the Dashboard rows ("Succeeded", "Failed", "Running" or "Waiting for you"), then how long ago and how long it took, or "Never run". Paused and finished rows are dimmed. Setup threads of older versions come first, with a "Setting up" badge: click one to open its session.
- A toolbar sits above the list. The search field filters by name, project or schedule. The filter shows All, Unread (with the count of tasks whose latest finished run is unread), Failed (the last run failed, or T3 Code failed before it opened a session), Running and Paused (paused tasks and finished reminders). The sort menu has Recent activity (default: the newest run first, tasks that never ran last), Next run (webhooks and paused tasks last) and Project (rows grouped under their project, which then leaves line 2). The browser remembers the filter and the sort (`t3-dashboard-automations-list` in local storage). When no task matches, the list says so.
- Each row has a switch (pause or resume; a finished reminder has none), a play button "Run now" (it waits while a run is in progress) and a "⋯" menu, the same menu as a project row in Sessions: Edit, Copy webhook URL (webhooks) and Delete.
- Click a row to open the task in a side sheet (600 px wide, full width on a phone). `Esc`, a click on the backdrop or the close button closes it. The sheet shows the kind, the title, the schedule and the buttons "Run now", "Edit", "Delete", "Copy webhook URL" (webhooks) and the switch. Then it lists the next run, the last run, the project, the model, the mode and, for a bound task, "Open session". The prompt follows in a scroll box capped at 220 px. "Run history" sits 16 px below the prompt, without stretching either section: all runs, newest first, each with its status pill, a dot when unread and "Open session". When the session was archived or deleted, the run shows "Session archived".
- Sessions of runs show everywhere as normal sessions (Dashboard, Sessions, search), with a calendar icon. Opening a run anywhere marks it read.
- The Automations entry of the sidebar shows a number: the tasks whose latest finished run is unread. A red alert circle shows when one of these runs failed. Opening the tab does not clear it: open the runs. A run with no session is not counted.
- The dashboard builds the history itself: T3 Code keeps none. It ties each run thread to its task by the task id that T3 Code writes on a user message of the thread, remembers the link, and keeps the runs in `~/.config/t3-dashboard/automation-runs.json` (20 per task). Renaming a task or a run thread keeps the link. A thread with no task id falls back to the project, title and creation date. A run whose session was archived before the dashboard saw it is missing.
- Without a task, the tab shows "No automations yet" and a "New automation" button. While it loads, the list shows three placeholder rows.

- A routine runs at each occurrence. The row shows the frequency, the next run and the last run. A paused task shows "Paused".
- A reminder is a task whose title starts with "Reminder: " or "Rappel : ". The prefix is not shown. T3 Code has no one-time type, so the dashboard pauses the task after its run. Older reminders paused themselves from their prompt: the dashboard still detects them. The row shows the date of the reminder.
- A webhook is a task that runs when a request arrives (see [Webhooks](#webhooks)).
- After its run, the dashboard pauses a reminder, also when the run failed (the row keeps its error). The dashboard never deletes a reminder. The row then shows "Finished" with the time of the run.
- To edit a task, choose "Edit" in the "⋯" menu of its row, or click "Edit" in its sheet. The creation form opens with the title, project, schedule, prompt, model and access mode of the task. Change what you need, then send. The kind of the task is fixed. A reminder needs a new time in the future: the form shows its next time, or no time when it already ran. Saving re-arms a paused reminder, and the dashboard keeps it enabled until its next run. A task linked to a thread runs there: its project is fixed, and a new title also renames the thread. A reminder keeps its "Reminder: " prefix.
- To delete a task, choose "Delete" in the "⋯" menu of its row, or click "Delete" in its sheet, then confirm. T3 Code deletes the task. You cannot undo this action.
- When you delete a reminder, the dashboard also archives the threads of its runs. A reminder linked to a conversation keeps that conversation.
- If T3 Code is too old to list the tasks, the tab shows the error. The Dashboard continues to work.

### Create an automation

1. Open a new automation. Click "New Automation" in the header of the Automations page, or push `⇧` + `N`. A window opens with a form.
2. Pick the kind: Routine, Reminder or Webhook.
3. Select a project, or keep "No project". The dashboard keeps this selection for the next time.
4. Set the schedule (see below), write the prompt, and pick the model. The first line of the prompt becomes the title.
5. Click "Create" ("Cancel" closes the form). The dashboard creates the task in T3 Code directly: no agent thread is involved. The task runs with full access unless you pick another mode in the model menu. If an error occurs, the window stays open and shows the error.

- A routine repeats. Choose "At a time" (a time and the days; no day means every day) or "Every N minutes" (1 to 525600).
- A reminder runs once at the date and time you pick (1 minute to 366 days ahead). The dashboard gives the task the title "Reminder: <title>" and pauses it after its run. The prompt stays as you wrote it.
- A reminder time is in your browser's time zone. A routine time is in the time zone of the machine that runs T3 Code. The row shows the next run: check it.
- If T3 Code is off for more than 10 minutes at the time of a reminder set less than 7 days ahead, T3 Code moves it one week later.
- The new task is not linked to a thread: each run opens its own thread.
- Setup threads from older versions still show on a setup row while their agent works. The dashboard reads `~/.config/t3-dashboard/automation-threads.json` to mark these threads with the automation icon. It no longer writes to this file.

### Webhooks

A webhook task runs when a service sends a request to its URL, for example a GitHub event. Each event opens a new thread in the project of the task.

1. Choose the kind "Webhook" in the new automation form.
2. Add filters. Only requests that match every filter start a run. Example for a review request: `headers.x-github-event` equals `pull_request`, `body.action` equals `review_requested`, `body.requested_reviewer.login` equals your GitHub login.
3. Turn on "Check the signature" (it is off by default) and type the signing secret. The defaults fit GitHub: header `x-hub-signature-256`, encoding hex, prefix `sha256=`. Use the same secret in GitHub.
4. Write the prompt for one event. It can use values such as `{{body.pull_request.html_url}}`. These values are untrusted data, not instructions.
5. Send. A panel shows the GitHub settings: Payload URL (a copy button), content type `application/json`, the secret you typed, and the events to select (for example Pull requests).

- The dashboard sends the secret once to T3 Code, which stores it. The dashboard never stores, logs or shows it again, and the field is empty after the send. An agent can still ask for a secret in a private card of a conversation.
- The row shows the status of the last run. It has no next run. You can edit a webhook task: its URL stays. In the form, an empty signing secret keeps the stored secret, and a new value replaces it.
- The public URL needs T3 Code Connect remote access. Without it, the panel says the access is off. Turn it on, then copy the URL from the Webhooks list.
- The URL contains a token. Treat it as a secret. The dashboard never shows it as text.

### Tasks stay out of worktrees

T3 Code can run a task in a new git worktree. Each run then opens a worktree, and the run can fail when the project has no usable branch. The dashboard watches the scheduled tasks while it runs. When a task uses a worktree, it moves the task to the project folder and keeps every other field. It tries each state once and logs a warning (without the prompt) if T3 Code refuses.

### From a conversation

You can also ask for a task in a normal conversation. `t3-dashboard install` adds a block of rules to the global instruction file of each agent, such as `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` (see [Agent rules](install.md#agent-rules)). With these rules, the agent uses `schedule_task`, names a reminder "Reminder: <title>", opens a new thread at each run (`bindToCurrentThread: false`) and does not add a self-disable step. To post in the conversation instead, ask for it.

### Threads of tasks without a linked conversation

A task without a linked thread creates a new thread at each run. These threads show like any session, with the automation icon. The dashboard ties a thread to its task by the task id that T3 Code writes on the first message of the thread, and remembers the link. A thread that this id does not tie is matched by the project, the title, the origin and the creation date of the task. Renaming a task or a run thread does not break the link. You open the thread of the last run from the row of the task.

### T3 Code limits

- The minimum interval is 1 minute.
- A fixed time follows the local time of the T3 Code server. T3 Code has no time zone for each task.
- The dashboard must run to pause a reminder. If it starts again less than one hour after the run, it pauses the reminder at once. After a longer stop, an interval reminder can run again: pause it from its row.
- The dashboard pauses a reminder only when its last change is the run itself. If you turn on a finished reminder again, the dashboard leaves it on until its next run ends.
- Pausing does not stop a run that is under way: T3 Code marks a run as succeeded when it sends the prompt.

## News

The News tab shows a daily or weekly article with the latest tech news. A T3 routine, owned by the dashboard, asks an agent to search the web and write the article. The scope is fixed: AI, software development, security, the tech industry and open source. It needs T3 Code to be connected, and a model that can search the web.

- On a wide screen, the list of articles is on the left, newest first, and the open article is on the right. The newest article opens first. The line above the list gives the next run and the result of the last run. It is empty while automatic generation is off.
- On a phone, the page shows the list. A tap opens the article, and the "News" button at its top returns to the list.
- Click "News settings" in the header to set automatic generation (on or off), the frequency (every day, or every week on a weekday you pick, Monday by default), the time of day, the language (English or French) and the model. The default model is Codex `gpt-6-luna`, when T3 offers it; you can pick another one. The time is read in the time zone of the machine that runs T3. A weekly article covers the last 7 days; a daily one covers the last 24 hours. The first save creates the routine. Each later save updates it. Turning "Automatic generation" off pauses the routine; "Run now" still works. If you pause or resume the routine in Automations, the setting follows it.
- Click "Run now" to start an article at once. A second article on the same day replaces the first. Before the first save, Run now saves the routine with the settings shown in News settings (paused or not, as set there), then starts the article.
- While an article is being written (Run now or a scheduled run), the list starts with "Writing the article…" and a spinner, with an "Open session" link. Run now is off and the page reads every 5 seconds. The dashboard finds the run thread through the task id on its first message, like Automations.
- The routine is a normal routine: it also shows in Automations, where you can pause or delete it. If you delete it, the next save creates it again.
- The dashboard archives the run threads of the news when the article is written. A failed run stays visible in Sessions.
- Hover over an article (or focus it with the keyboard) to show a trash button, "Delete article". On a touch screen the button is always visible. A dialog asks you to confirm, like for an automation, then the dashboard deletes the file. If you delete the open article, the newest one opens. "Delete all" above the list deletes every article after a confirmation. Only the article files (`YYYY-MM-DD.md`) are deleted: other files in the folder stay. A deleted article does not come back.
- Above the list, one row holds a search box ("Search news…") and the "Delete all" button. The search looks in the title and in the text of every article, ignoring case and accents. The list shows only the matches (after a short pause while you type), or "No matching articles". Clear the box to see all articles again. The open article stays open, even when the search hides it. "Delete all" always deletes every article, not only the matches, and its dialog says so. The row is hidden when there is no article.
- Without an article, the page says "No news yet".
- The News tab (sidebar and phone bar) has a badge with the number of unread articles, like the other tabs. Opening an article marks it read: this includes the newest one, which the page opens by itself. On a phone, only the article view counts, not the list. A new run on the same day makes that article unread again. Articles that exist at the first visit count as read. The read marks use the same shared state as the Dashboard (`seen.json`), so they follow you across devices.

## Pull requests

The Pull requests page lists your open pull requests and shows the diff of one pull request, to review it without leaving the dashboard. It is read only: the page cannot approve, comment or merge.

- It needs the GitHub CLI (`gh`) on the machine that runs the dashboard, signed in with `gh auth login`. The dashboard looks for `gh` on the `PATH`, then in `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin` and `~/.local/bin`. Set `T3_DASHBOARD_GH_BIN` to use another file. Without `gh`, or without a login, the page shows an error that says so.
- The Pull requests tab (sidebar and phone bar) has a badge with the number of unread pull requests, like the other tabs. A pull request is unread from its creation until you open it (its page, from the list, from a session menu or from a link); a push or a comment does not make it unread again. Pull requests that exist at the first visit count as read. The read marks use the same shared state as the Dashboard (`seen.json`), so they follow you across devices.
- The list holds the open pull requests that you wrote and the ones that wait for your review (50 of each at most), grouped by repository. The search field finds a pull request by title, number, repository, author or branch. On the same row, as on Automations, "All", "Mine", "To review" and "Unread" filter the list ("Unread" shows the count of open pull requests that you have not opened yet), a repository menu narrows it to one repository, and the refresh button sits at the end. The repository menu always has a search field. Type part of an owner or repository name to filter its options. The search and the filters stay at the top while the list scrolls. The browser keeps this filter and the repository filter when you open a pull request and come back, reload the page or come back later; the search text is not kept, as on Automations. A saved repository that has no open pull request any more shows all repositories. A row shows the title (with a hollow ring when you have not opened the pull request yet), the number, the author, the branch, the age, the checks (passed, failed or running), the review (approved, changes requested or review required), a "Draft" label and the +/- counts. The refresh button reads GitHub again.
- A pull request that is linked to a session (T3 Code linked it, or the session branch has it) shows a "Session" button. It opens the session like any other list: `Shift` adds it next to the open columns. A pull request can belong to several sessions: the button then shows "Sessions" and their count, and opens a menu with one line per session.
- Open a pull request from a session to keep a return button beside its title, including on a phone. The button shows a back arrow and "Back to session". On a phone, it shows only the arrow; its accessible label stays "Back to session". Its tooltip names the source session. Open sessions and their reading positions stay in place while you review the pull request. The address keeps the source session after a reload. If that session no longer exists, the back arrow opens the pull request list.
- Click a row to open the pull request (`#/pulls/<owner>/<repo>/<number>`, an address you can share or bookmark). A compact header stays at the top while the diff scrolls. Its first line has the back arrow (to the list), the title and number, and on the right "Open on GitHub" (with the GitHub logo), "Open session" (or a "Sessions" menu with their count when several sessions are linked) and the icon buttons of the diff. Its second line has the repository, the author, the branches and the age, and on the right the state, the checks and review badges, the +/- counts and the number of files. Click the checks and review badges to see each check (name, result, link) and each review in a popover.
- Under the header (on a phone, under the repository line and the badges), two tabs: "Description" shows the text of the pull request, and "Changes" (with the file count) shows the diff. The page opens on "Description", and each tab keeps its scroll position. On a phone a third tab, "Files", shows the changed files as a tree: tap a file to open it in "Changes".
- On a wide screen (1100 px or more) a column on the left shows the changed files as a folder tree, with their +/- counts. Click a folder to open or close it, and a file to scroll the diff to it. The file at the top of the diff is highlighted while you scroll. A flask marks a test file, and a collapsed test file is dimmed. The panel button of the header ("Hide files" / "Show files") slides the tree shut, as the Sessions list does, so the diff takes the full width; the browser keeps this choice. Between a phone and a wide screen, the "Changed files" button opens the same tree in a side sheet.
- The diff shows each changed file as a block, in the order of the file tree (folder by folder), with its path, its status (added, deleted, modified, renamed), its +/- counts, its line numbers and syntax highlighting. Click the file name to collapse or expand it. A file of more than 400 changed lines starts collapsed, and files stop opening once 3000 lines are open. A binary file and a file of more than 3000 lines show a note in place of the code.
- The header buttons "Collapse all" / "Expand all" act on every file, and "Collapse tests" / "Expand tests" act on the test files only (test folders, `*.test.*`, `*.spec.*`, snapshots, `*_test.go`, `test_*.py`). The tests button shows only when the diff has a test file. The refresh button reads GitHub again. The file headers stay in view while you scroll.
- On a phone, the list and the pull request take the full width, and a long line of code scrolls sideways. The general page header hides while a pull request is open. The bottom navigation stays visible. The header starts at the screen top, with the same spacing, title size and button sizes as a session header. Long titles stay on one line and end with an ellipsis; the pull request number stays visible. The pull request header keeps the page background. The pull request header keeps the back arrow, the title and one "…" menu with every action (GitHub, sessions, collapse, refresh). The repository line and the badges scroll with the diff. The diff runs from edge to edge of the screen.
- The dashboard reads GitHub through `gh`. It keeps the list for 25 seconds. When the list is older than that, the page shows it at once and the dashboard reads a new one in the background: the page updates a moment later. The refresh button always reads GitHub again. Each pull request is kept for 60 seconds too.
- The dashboard reads the list again every 30 s while the Pull requests tab is open, and every 2 minutes on other pages (it feeds the badge and the session menus). It does not read when the page is hidden. It reads the list again at once when you come back to the list.
- A pull request that you opened before shows at once from the memory of the page, then updates. The dashboard keeps the diff by the head commit of the pull request. It asks the diff for the newest head that the list knows, so a new push shows a new diff after the next read of the list. The refresh button always reads the head again. The browser also keeps a diff for a given head commit, so a diff that you saw before does not load again. A diff over 2 MB is cut, and the page says so.
- A file with more than 400 changed lines is collapsed. Its row shows a "Load diff (N lines)" button. A file with more than 1000 lines shows without syntax colors.

## Settings

Open Settings with the header button or the `,` key. A sidebar on the left lists the tabs. Only one tab is visible at a time.

- Appearance: "System", "Light" or "Dark" theme, the accent color (blue by default; purple, pink, red, orange, yellow or green). The accent color paints the buttons, the links, the focus ring, the logo and the tab icon. The interface is "Neutral" (default) or "Tinted": "Tinted" mixes the accent color into the background, the cards and the lines. Each browser keeps its own choice.
- Connections: GitHub CLI installation and login status on the dashboard server, checked when the tab opens or you click "Check again". Install `gh` if missing, then run `gh auth login --hostname github.com` as the dashboard service user. The dashboard reads the status only; it does not log in or log out for you. Also shows the status of the Linear key, change or removal of the key. Below it, Alerts: phone alerts through [ntfy](https://ntfy.sh). See [install.md](install.md#alerts). Without a setup, the block lists the steps and has a "Set up" button, which creates a private topic on `https://ntfy.sh`. Once set up, the block is one line: "Connected", the topic masked like the Linear key (copy gives the full topic), then four icons: copy the topic, subscribe in the ntfy app, send a test alert and disconnect. Disconnect also turns off every alert that is on.
- App: how to install the dashboard as an application (Dock, Launchpad, Start menu, home screen). The steps change with the browser and the device: Safari, Chrome, Edge, iPhone and iPad, Android. Dia and Firefox do not install web apps.
- Updates: installed version, check for and installation of an update. See [install.md](install.md#updates).

## Keyboard shortcuts

The shortcuts use `Ctrl`, also on a Mac, and they work while you type in a field. They do not work while a dialog is open, except `Ctrl` + `K`. `⌘` keeps its browser meaning. `Esc` and the arrows stay plain keys: a field needs them, so they act only outside a field.

| Key | Action |
| --- | --- |
| `Ctrl` + `1`, `2`, `3`, `4`, `5` | Opens the pages in the order of the sidebar: Dashboard, Sessions, Pull requests, Automations, News. |
| `Ctrl` + `K` or `⌘` + `K` | Opens or closes the "Jump to" switcher. It finds a conversation by title, project or message. Without text, it shows the agents that wait for an answer, then your recent conversations. `↑` `↓` select, `Enter` opens in Sessions. |
| `Ctrl` + `S` | In the message field of a conversation: stashes the draft. |
| `Ctrl` + `N` | Opens New Session. |
| `Ctrl` + `⇧` + `N` | Opens a new automation (New Automation). |
| `Ctrl` + `,` | Opens Settings. |
| `Ctrl` + `B` | Collapses or expands the sidebar. |
| `Ctrl` + `X` | Sessions: closes the active session. |
| `Ctrl` + `O` | Sessions: toggles fullscreen, also on macOS. |
| `Ctrl` + `F` | Sessions: searches the active session. Cmd+F also works on macOS. |
| `Esc` | Sessions, outside a field: exits full screen. In the message field, it leaves the field. |
| `←` `→` | Sessions, outside a field: moves the focus to the next column and scrolls it into view. |
| `↑` `↓` | Sessions, grid view, outside a field: moves the focus between the two sessions of a column. |

In Sessions, typing a letter outside any field writes it in the message field of the active session: no click needed first.

On Windows and Linux, the browser keeps `Ctrl` + `N`, `Ctrl` + `⇧` + `N` and `Ctrl` + `1` to `5` for itself: use the buttons there.

A tooltip gives the name of each button and its shortcut. It stays next to the button, including when you move between buttons near the screen edge. The animations stop if the system asks for reduced motion (`prefers-reduced-motion`).

Dialogs close over 280 ms on desktop and mobile. On a phone, they slide down and fade, including when you drag them down.

Pull request pages and session menus show status icons: green for open, purple for merged, red for closed, and gray for draft. Missing session status stays gray.

News articles sit near the page center with space from the article list and a maximum reading width of 42rem.

In demo mode, the checkout and chart comparison sessions include merged PR #137. Its menu icon and page badge are purple.

The session PR menu icon is green when any PR is open and ready. Otherwise, a remaining draft gives a gray draft icon. All merged gives a purple merge icon; all closed gives a red closed icon. Mixed final or unknown states stay gray. Each menu row keeps its own status.

### Conversation tools

Hover over a session in the list and open its **…** menu. Session and project **…** buttons have no hover tooltip. On touch screens, the menu button stays visible.
Choose **Rename** first to edit the title, or double-click the title in the session header. Enter saves the title; Cancel leaves it unchanged.
Title regeneration stays available while an agent runs or waits for your answer.
Choose **Regenerate title** (the refresh icon), toggle phone alerts when configured, or open the session in T3 Code. This action uses the same T3 logo as the session header.
Select message text, then choose the quotation icon with **Cite** beside the selection to append a Markdown quote to your draft. On touch screens, **Cite** appears above the composer to avoid the native selection menu. The button closes on scroll or Escape.
On desktop, Ctrl+F (Cmd+F on macOS) opens search directly, with no permanent search toolbar. On mobile, tap the search icon beside the other actions in the session header. The field opens with the keyboard. Search matches message text without case sensitivity.
Matching text is highlighted inside messages. The active message uses a stronger highlight. Closing search removes the highlights.
The search bar separates the field, result counter, and navigation buttons with space.
The counter counts matching messages. Use the arrows or Enter and Shift+Enter to move between them. Escape closes search.
The fullscreen button remains in the session header.
