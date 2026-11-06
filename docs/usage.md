# Usage

[Back to the README](../README.md)

The dashboard has three pages: Dashboard, Sessions and Automations. A sidebar on the left lists them, with a search button (`⌘` + `K`). Its last row shows the connection state, Settings and a button that collapses the sidebar to icons (`Ctrl` + `B`). The theme and the accent color are in Settings. The sidebar remembers its state. The page header is one line: the title and a short description. Its button depends on the page: Sessions has a list toggle (wide screen), a layout button and New Session (`Ctrl` + `N`), Automations has New Automation (`Ctrl` + `⇧` + `N`), and Dashboard has the Notifications bell, with the number of unread items, then Edit layout. The two shortcuts work on every page. On a phone, a bar at the bottom of the screen replaces the sidebar: Dashboard, Sessions and Automations. The header then shows the page buttons as icons (on Dashboard, the bell too), a search button and Settings. A dot on Settings shows that an update is ready.

## Dashboard

Dashboard opens first. At the top, the Usage card shows the usage limits of your providers (Codex, then Claude), read from T3 Code. Each provider has one tile per limit window (Session, Weekly, or a model-specific one). A tile shows the percent used and a meter. The meter fills with the percent used. It is blue below 75 %, amber from 75 % and red from 90 %. A thin tick shows the share of the window already elapsed. Under the meter, a caption gives the time to the reset and the pace (ahead of, on or under pace). When a provider has banked reset credits, its header shows their number with a ticket icon. The Activity card comes next. It shows three numbers for the last 7 days, each with its change from the 7 days before: turns (the runs of your T3 Code threads: the messages sent to agents, by you or by an automation), sessions with at least one turn, and spend (the API equivalent). Spend and tokens come from T3 Code and cover all usage on this machine, not only these threads. A chart shows turns, spend or tokens for each of the last 14 days. Below it, the Server card shows the machine that runs the dashboard: three tiles with the CPU used (the percent busy since the last read, and the number of cores), the memory used (of the total) and the disk used (of the disk that holds your home directory). The meters use the same colors as the Usage card. A line in the header gives the host name, the system and the uptime. The card reads every 10 seconds while it shows. The cards flow in one grid: Usage, Activity and Server take the full width, and the other cards sit two per row where they fit. The Notifications panel is on the right and is open by default. It stays in view while the page scrolls. The bell in the header opens and closes it. When the panel is closed, the cards take the full width. The browser remembers the panel state (`t3-dashboard-notifications` in local storage). On a screen 1200 px wide or less, there is no room for the column: the panel is a side sheet that slides in from the right, under the header. On a phone it is as wide as the screen and stops above the bottom bar. Between 701 and 1200 px it is at most 380 px wide. A dimmed backdrop covers the page: a tap on it, `Esc` or the bell closes the sheet, and the page does not scroll while it is open. The sheet is closed by default. It is not saved, and it closes when you leave Dashboard. On a phone, the cards stack in the saved order.

- Click "Edit layout" to move the cards. Drag a card by its header to a place between two cards. The arrow buttons move the card up or down: use them with the keyboard or on a touch screen. The eye button hides the card. A list of hidden cards shows at the top, with a button to show each one. Notifications is not part of the layout, and edit mode hides it. A hidden card reads no data: Usage, Activity, Server and Up next stop their calls, and read again when you show the card.
- Click "Done" to leave edit mode. "Reset" restores the default layout. The browser saves the layout (`t3-dashboard-layout` in local storage), so each browser has its own.

- If T3 Code is too old to report usage limits, the Usage card says so. If it is too old to report usage, the spend shows "—" and the reason. The rest of the Dashboard keeps working.

## Dashboard cards

Notifications, Running and Up next list your agents and tickets. Notifications is a panel, the other two are cards. The Dashboard entry in the sidebar shows the number of unread items (waiting, failed or finished, not read yet). The Sessions entry shows the number of rows of the sessions list that run or are unread, open as a column or not, and an orange dot when an agent waits for you. The "running" line of the sessions number in the Activity card and the Running card show the number of running agents. `Ctrl` + `1` opens Dashboard.

- Notifications lists, newest first in each group: the agents that need you (waiting for an approval or an answer, or failed and not settled), then the unread results, then the recent read agents, greyed. A status icon shows the kind: warning (waits for you), alert (failed), check (finished). Each item shows the title, one line of detail (what it waits for, the error, or the model), the project and the time. Items that need you or are unread have a tint and a dot. The badge in the header counts them.
- Point at an unread item to see its one button: the check marks it read. An agent that waits or failed has no button: it still needs you. The Running card rows have no button. A click on a notification opens the conversation in Sessions and marks it read. `⇧` + click opens it in Sessions without leaving Dashboard.
- The "Mark all read" button of the header marks all unread results read.
- "See all" shows every read agent, also the ones with no activity for 3 days or more, and the "Settle all older than 3 days" button. When nothing needs you, the card says "Nothing needs you". Settled agents are not listed: find them with `⌘` + `K`.
- Running lists the agents that work, each with a pulsing dot, the model, the project and the time. A click opens the conversation in Sessions, or goes to it when it is already open.
- Up next lists the agents of started tickets that stopped ("To relaunch": the agent finished, you read it, and it has been idle for more than 24 hours), then the tickets that have no agent, started ones first (see [Tickets](#tickets)). It shows 5 tickets, then "Show N more". It also shows the Linear connection and the setup card when you have no key.
- Archived or deleted sessions and sub-agents do not appear. The sessions of automations (run threads of routines, reminders and webhooks) appear like any session, with a small calendar icon after the title (see [Automations](#automations)).
- The "Settle" button (box icon) settles an agent, as T3 Code does: it leaves the lists. It does not exist for an agent that works or waits.

The rows change status live, without a page reload. The toasts and the browser notifications still tell you when an agent waits or finishes. A click on a toast opens the conversation.

### Tickets

The Linear tickets feed "To relaunch" and "Up next". They need a Linear API key: see [install.md](install.md#linear). Only the tickets assigned to you in the states "Todo" and "In Progress" count. The other states (triage, backlog, done, canceled) never show.

- A ticket has an agent when the title of a session contains its number, for example `ABC-123`. A session that you archive in T3 Code no longer counts: its ticket comes back.
- "Up next" holds the tickets in the "Todo" and "In Progress" states with no agent. "In Progress" tickets come first, then the tickets are sorted by priority (urgent first, no priority last), then by update date.
- The foot of a ticket card shows its Linear project on the left. Point at the ticket to see 2 buttons on the right (on a touch screen they always show). The copy button copies the link of the issue. The robot button opens the New Session window with the ticket: choose the project, the model and the instructions, then create the session. The window selects the last project that you chose for the Linear team. The session opens in Sessions, and the ticket leaves the list.
- Click a ticket card to open the issue in Linear. The "Refresh" button of "Up next" reads the tickets again immediately.
- The browser keeps the project selection in its `localStorage`, not on the server.

## Sessions

Sessions shows your open conversations side by side. Each session is a column at least 380 px wide that fills the height of the page. When the columns do not fill the width, they widen to share it; when they need more room, the strip scrolls sideways. A hairline separates the columns.

- A list panel sits left of the columns. It lists every thread that is not settled (a settled thread that runs or waits stays), without sub-agents. Automation sessions show with a calendar icon after the title. ⌘K finds the settled ones.
  - Grouped view (default): one row per T3 Code project that has a listed thread, with a chevron to fold it, its icon, and the number of running threads (accent). In the grouped view each thread row shows the provider logo and the model; in the flat view it shows the project icon and name instead. Point at a project and click "+" to start a New Session in it. Flat view: one list, most recent first. A button in the list band, after collapse/expand all, switches the view.
  - Each row has a status mark (a pulsing dot when it runs, orange when it waits for you, red when it failed, a hollow accent ring when it is unread), the title and "time · model". A thread open as a column has a thin accent bar on its left and a bold title, a closed one has a muted title, and the focused one a filled background. Click a row to open it as a column, or to focus its column and scroll it into view. Point at an open row to see a cross that closes its column; the thread stays in the list.
  - A slim band at the top of the panel has small icon buttons. On the right: "Collapse all projects" or "Expand all projects" (grouped view only), the view button (grouped or flat), and "Close all sessions", which closes every column with no confirmation. There is no band at the bottom.
  - The "Hide the list" button is in the page header (wide screen only), before the layout button; it becomes "Show the list" when the list is hidden. Each browser keeps the panel state, the view and the folded projects.
- A new session opens at the right end and scrolls into view.
- A session never opens by itself. It opens when you create it (New Session, a Linear ticket), click it in the list, a Dashboard row or a notification, or pick it with ⌘K. Every thread still shows in the list with its status. At most 100 sessions stay open.
- One button in the page header switches between the two views: its icon and tooltip name the view it switches to. Column view shows one session per column. Grid view stacks two sessions in each column, and the strip still scrolls sideways. Each browser keeps its choice.
- Each session has a header with a drag handle, its title, a state badge when it runs (with a pulsing dot), waits for you or failed (none when it is done or idle), the project name, and three buttons: open in T3 Code, full screen, close. Drag the header onto another session to swap them.
- Close a session with the x button. It stays in the list; open it again from the list, the Dashboard or the switcher.
- An error of the dashboard in a session (a send or a load that fails) shows as one quiet red line at the top of that session, gone after 8 seconds or with its x. Errors of the whole dashboard keep the red banner at the top of the page.
- The server keeps which finished conversations you opened, for the Dashboard lists and the Dashboard badge, in `~/.config/t3-dashboard/seen.json`. A conversation read on one device is read on all of them.
- On a phone, Sessions shows the list on the whole page, with the bottom bar. Tap a thread to open it on the whole screen: the header and the bottom bar go, and the session header has a back arrow to the list. Swipe left or right to move to the next or previous open session. Closing the session goes back to the list. A session opened from the Dashboard, a notification or the search opens on the whole screen at once; the Sessions entry of the bottom bar shows the list. The layout button does not show on a phone. The view button, collapse/expand all and close all are in the list band; there is no hide button. After each swipe, dots show for a moment where the session sits among the open ones.
- The server keeps which conversations are open in Sessions in `~/.config/t3-dashboard/sessions.json`. Every device shows the same conversations, and an opened or closed session appears on the other open tabs at once. Each device keeps its own session order, focused session, full screen session, layout and Jump to history.

### Conversation

Each session contains a conversation.

- Write a message and send it with `Enter`. During a run, the message waits in the "Up next" list (dashed border). T3 Code sends it when the turn ends.
- Under each queued message, three icons: "Send now" (the same arrow as Send), edit, remove. During a run, "Send now" steers: the message goes into the current run now. After a Stop, T3 Code holds the queue, and "Send now" starts a turn with this message.
- Attach files with the paperclip, by drag and drop anywhere on the conversation (a dashed frame shows the drop area; it does not work in a subagent thread), or by paste. A chip shows each upload ("uploading", ready or "failed" with a retry button). Send waits for all uploads. The limits are those of T3 Code: 100 files, 10 MB for each image (PNG, JPEG, GIF or WebP), 50 MB for each other file and 80 MB of images in all.
- Type `@` after a space to search the files of the conversation folder. Use the arrow keys and `Enter` or `Tab` to insert `@path`. `Escape` closes the list.
- Type `/` at the start of the message to list the commands of the provider. Type `$` after a space to list its skills. The lists follow the thread folder. The menus work like the `@` list and insert `/command ` or `$skill `. Built-in T3 Code commands (`/model`, `/plan`, `/side`) are not in the lists.
- The Compact button shows the context size, for example `Compact 722k`. It appears as in T3 Code: on a Claude thread of 200k tokens or more whose prompt cache has expired (70 minutes after the last turn by default), and never during a run. `/compact` stays in the `/` list at any size. Click it, or pick `/compact`, to compact the thread.
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

- The proposed model is the default model of the project. If there is none, it is the default model of T3 Code.
- The favorite models of T3 Code are at the top of the list.
- The browser keeps the last project that you selected.

## Automations

The Automations tab lists the scheduled tasks of T3 Code, with the history of their runs. It needs T3 Code to be connected. The list updates every 30 s while T3 Code is connected.

- "Recent runs" at the top lists the last 8 runs of all tasks: status, task, start time, duration and a dot when the session is unread. Click a run to open its session. A run with no session (T3 Code failed before it opened one) is not clickable: point at "Error" to read the message.
- The list has these groups: "Setting up" (setup threads of older versions), "Running", "Needs attention" (the last run waits for you, or failed and you did not open it; a failure with no session stays until a newer run exists), "Upcoming", "Paused" and "Finished" (both closed). An empty group does not appear.
- Each row shows the kind icon, the title, the project, the schedule, the next run (an enabled webhook says "On each delivery") and the last result.
- Search by name, project or schedule. The project list filters by project.
- Click a row to open its panel on the right. On a phone the panel fills the page: use the back arrow or `Esc` to return.
- The panel shows the kind, schedule, project, model, next run and state. The buttons are "Open session", "Edit", "Copy webhook URL" (webhooks) and "Delete". "History" lists the runs, newest first: status, date, duration, a dot when unread, and an "Open" button. When the session was archived or deleted, the run shows "Session archived".
- Sessions of runs show everywhere as normal sessions (Dashboard, Sessions, search), with a calendar icon. Opening a run anywhere marks it read.
- The Automations entry of the sidebar shows a number: the tasks whose latest finished run is unread. A red dot shows when one of these runs failed. Opening the tab does not clear it: open the runs. A run with no session is not counted.
- The dashboard builds the history itself: T3 Code keeps none. It matches run threads to tasks by project, title and creation date, and keeps the runs in `~/.config/t3-dashboard/automation-runs.json` (20 per task). This is best effort: renaming a task or a thread can break the match, and a run whose session was archived before the dashboard saw it is missing.
- Without a task, the tab shows "No automations yet" and a New Automation button.

- A routine runs at each occurrence. The row shows the project, the frequency, the next run and the status of the last run. A paused task shows "paused".
- A reminder is a task whose title starts with "Reminder: " or "Rappel : ". The prefix is not shown. T3 Code has no one-time type, so the dashboard pauses the task after its run. Older reminders paused themselves from their prompt: the dashboard still detects them. The row shows the date of the reminder.
- A webhook is a task that runs when a request arrives (see [Webhooks](#webhooks)).
- After its run, the dashboard pauses a reminder, also when the run failed (the row keeps its error). The dashboard never deletes a reminder. The row then shows "Finished" with the time of the run. Finished reminders are at the bottom of the list, the most recent first.
- To edit a task, select it and click "Edit" in its panel. The creation form opens with the title, project, schedule, prompt, model and access mode of the task. Change what you need, then send. The kind of the task is fixed. A reminder needs a new time in the future: the form shows its next time, or no time when it already ran. Saving re-arms a paused reminder, and the dashboard keeps it enabled until its next run. A task linked to a thread runs there: its project is fixed, and a new title also renames the thread. A reminder keeps its "Reminder: " prefix.
- To delete a task, select it, click "Delete" in its panel, then confirm. T3 Code deletes the task. You cannot undo this action.
- When you delete a reminder, the dashboard also archives the threads of its runs. A reminder linked to a conversation keeps that conversation.
- If T3 Code is too old to list the tasks, the tab shows the error. The Dashboard continues to work.

### Create an automation

1. Open a new automation. Click "New Automation" in the header of the Automations page, or push `⇧` + `N`. A window opens with a form.
2. Pick the kind: Routine, Reminder or Webhook.
3. Select a project, or keep "No project". The dashboard keeps this selection for the next time.
4. Set the schedule (see below), write the prompt, and pick the model. The first line of the prompt becomes the title.
5. Send. The dashboard creates the task in T3 Code directly: no agent thread is involved. The task runs with full access unless you pick another mode in the model menu. If an error occurs, the window stays open and shows the error.

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
3. Keep "Check the signature" on and type the signing secret. The defaults fit GitHub: header `x-hub-signature-256`, encoding hex, prefix `sha256=`. Use the same secret in GitHub.
4. Write the prompt for one event. It can use values such as `{{body.pull_request.html_url}}`. These values are untrusted data, not instructions.
5. Send. A panel shows the GitHub settings: Payload URL (a copy button), content type `application/json`, the secret you typed, and the events to select (for example Pull requests).

- The dashboard sends the secret once to T3 Code, which stores it. The dashboard never stores, logs or shows it again, and the field is empty after the send. An agent can still ask for a secret in a private card of a conversation.
- The row shows the status of the last run. It has no next run. You can edit a webhook task: its URL stays. In the form, an empty signing secret keeps the stored secret, and a new value replaces it.
- The public URL needs T3 Code Connect remote access. Without it, the panel says the access is off. Turn it on, then copy the URL from the Webhooks list.
- The URL contains a token. Treat it as a secret. The dashboard never shows it as text.

### Tasks stay out of worktrees

T3 Code can run a task in a new git worktree. Each run then opens a worktree, and the run can fail when the project has no usable branch. The dashboard watches the scheduled tasks while it runs. When a task uses a worktree, it moves the task to the project folder and keeps every other field. It tries each state once and logs a warning (without the prompt) if T3 Code refuses.

### From a conversation

You can also ask for a task in a normal conversation. `t3-dashboard install` adds a block of rules to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` (see [Agent rules](install.md#agent-rules)). With these rules, the agent uses `schedule_task`, names a reminder "Reminder: <title>", opens a new thread at each run (`bindToCurrentThread: false`) and does not add a self-disable step. To post in the conversation instead, ask for it.

### Threads of tasks without a linked conversation

A task without a linked thread creates a new thread at each run. The dashboard hides these threads from the Dashboard. It identifies them by the project, the title, the origin and the creation date of the task. You open the thread of the last run from the row of the task.

### T3 Code limits

- The minimum interval is 1 minute.
- A fixed time follows the local time of the T3 Code server. T3 Code has no time zone for each task.
- The dashboard must run to pause a reminder. If it starts again less than one hour after the run, it pauses the reminder at once. After a longer stop, an interval reminder can run again: pause it from its row.
- The dashboard pauses a reminder only when its last change is the run itself. If you turn on a finished reminder again, the dashboard leaves it on until its next run ends.
- Pausing does not stop a run that is under way: T3 Code marks a run as succeeded when it sends the prompt.

## Settings

Open Settings with the header button or the `,` key. A sidebar on the left lists the tabs. Only one tab is visible at a time.

- Appearance: "System", "Light" or "Dark" theme, the accent color (blue by default; purple, pink, red, orange, yellow or green). The accent color paints the buttons, the links, the focus ring, the logo and the tab icon. Each browser keeps its own choice.
- Connections: status of the Linear key, change or removal of the key.
- App: how to install the dashboard as an application (Dock, Launchpad, Start menu, home screen). The steps change with the browser and the device: Safari, Chrome, Edge, iPhone and iPad, Android. Dia and Firefox do not install web apps.
- Updates: installed version, check for and installation of an update. See [install.md](install.md#updates).

## Keyboard shortcuts

The shortcuts use `Ctrl`, also on a Mac, and they work while you type in a field. They do not work while a dialog is open, except `Ctrl` + `K`. `⌘` keeps its browser meaning. `Esc` and the arrows stay plain keys: a field needs them, so they act only outside a field.

| Key | Action |
| --- | --- |
| `Ctrl` + `1`, `2`, `3` | Opens Dashboard, Sessions or Automations. |
| `Ctrl` + `K` or `⌘` + `K` | Opens or closes the "Jump to" switcher. It finds a conversation by title, project or message. Without text, it shows the agents that wait for an answer, then your recent conversations. `↑` `↓` select, `Enter` opens in Sessions. |
| `Ctrl` + `S` | In the message field of a conversation: stashes the draft. |
| `Ctrl` + `N` | Opens New Session. |
| `Ctrl` + `⇧` + `N` | Opens a new automation (New Automation). |
| `Ctrl` + `,` | Opens Settings. |
| `Ctrl` + `B` | Collapses or expands the sidebar. |
| `Ctrl` + `X` | Sessions: closes the active session. |
| `Ctrl` + `F` | Sessions: puts the active session in full screen, or takes it out of full screen. |
| `Esc` | Sessions, outside a field: exits full screen. In the message field, it leaves the field. |
| `←` `→` | Sessions, outside a field: moves the focus to the next column and scrolls it into view. |
| `↑` `↓` | Sessions, grid view, outside a field: moves the focus between the two sessions of a column. |

In Sessions, typing a letter outside any field writes it in the message field of the active session: no click needed first.

On Windows and Linux, the browser keeps `Ctrl` + `N`, `Ctrl` + `⇧` + `N` and `Ctrl` + `1` to `3` for itself: use the buttons there.

A tooltip gives the name of each button and its shortcut. The animations stop if the system asks for reduced motion (`prefers-reduced-motion`).
