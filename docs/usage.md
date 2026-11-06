# Usage

[Back to the README](../README.md)

The dashboard has three pages: Home, Desk and Automations. A sidebar on the left lists them, with a search button (`Ctrl` + `K`), the connection state, a theme toggle, Settings and a button that collapses the sidebar to icons. The sidebar remembers its state. The page header holds the New Agent and New Automation buttons. On a phone, a bar at the bottom of the screen replaces the sidebar: Home, Desk, Automations and Settings.

## Home

Home opens first. At the top, a usage card shows three numbers for the last days: turns (with the change from the 7 days before), sessions and spend. A chart shows turns, spend or tokens for each of the last 14 days. Two small cards show today and what needs you. The Inbox follows below.

- Turns are the runs of your T3 Code threads. Spend and tokens come from T3 Code and cover all usage on this machine, not only these threads. The spend is the API equivalent.
- If T3 Code is too old to report usage, the spend shows "—" and the reason. The rest of Home keeps working.

## Inbox

The Inbox is the part of Home below the usage cards. It shows what needs you. It is a list of rows, not a grid. It has no grouping by project: each row shows its project as a small tag. The Home entry in the sidebar shows the number of unread items (waiting, failed or finished, not read yet). `Ctrl` + `B` opens Home.

- A summary line starts the page, for example "2 need you · 3 unread · 1 to relaunch". It shows only the parts that are not zero.
- A row shows the provider (Claude or Codex), the title, the project tag, the status and the time of the last activity.
- The sections are, from top to bottom: "Needs you", "Unread", "To relaunch", "Running", "Up next", then two closed sections: "Read and idle" and "Recently settled". An empty section does not appear.
- In each section, the agents pinned in T3 Code come first, with a small pin. Then the most recent activity comes first.
- "Needs you" lists the agents that wait for an approval or an answer, and the agents that failed and that you did not settle. The badge tells which one. Point at the badge of a failed agent to read the error. The section shows 10 rows, then "Show N more".
- "Unread" lists the agents that stopped without error, that you did not settle and that you did not read. A click on the row opens the conversation and marks it read. "Mark all read" marks the whole section. The section shows 10 rows, then "Show N more".
- "To relaunch" lists the agents of started tickets that stopped: the agent finished, you read it, and it has been idle for more than 24 hours.
- "Up next" lists the tickets that have no agent, started ones first (see [Tickets](#tickets)). It shows 5 rows, then "Show N more".
- "Running" lists the agents that work. "Read and idle" lists the finished agents that you read and that are not in "To relaunch". Its "Settle all older than 3 days" button settles the ones with no activity for 3 days. "Recently settled" disappears after 3 days without activity. Its rows have an "Unsettle" button.
- The Inbox shows cards, several per line. Every agent card works the same way. A click on the card opens the conversation on the Desk and marks it read. `⇧` + click adds it to the Desk without leaving the Inbox. In the bottom right corner, the T3 Code logo opens the conversation in T3 Code, the archive button settles the agent (or unsettles it in "Recently settled") and `+` adds it to the Desk.
- When "Needs you", "Unread", "To relaunch" and "Up next" are empty, the Inbox shows "Nothing needs you".
- Archived or deleted sessions, sub-agents and the threads of scheduled tasks, webhook runs included (see [Automations](#automations)), do not appear.
- Click a row to open the conversation on the Desk. Shift + click adds it to the Desk and keeps the current tab.
- The "Add to Desk" button adds the row to the Desk. A second click removes it.
- The "Open in T3 Code" link opens the session in T3 Code.
- The "Settle" button (box icon) moves an agent to "Recently settled", as T3 Code does. It does not exist for an agent that works or waits.

The rows change status live, without a page reload. The toasts and the browser notifications still tell you when an agent waits or finishes. A click on a toast opens the conversation.

### Tickets

The Linear tickets feed "To relaunch" and "Up next". They need a Linear API key: see [install.md](install.md#linear). Only the tickets assigned to you in the states "Todo" and "In Progress" count. The other states (triage, backlog, done, canceled) never show.

- A ticket has an agent when the title of a session contains its number, for example `ABC-123`. A session that you archive in T3 Code no longer counts: its ticket comes back.
- "Up next" holds the tickets in the "Todo" and "In Progress" states with no agent. "In Progress" tickets come first, then the tickets are sorted by priority (urgent first, no priority last), then by update date.
- The foot of a ticket card shows its Linear project on the left and 2 buttons on the right. The copy button copies the link of the issue. The robot button opens the New Agent window with the ticket: choose the project, the model and the instructions, then create the session. The window selects the last project that you chose for the Linear team. The session goes onto the Desk, and the ticket leaves the list.
- Click a ticket card to open the issue in Linear. The "Refresh" button of "Up next" reads the tickets again immediately.
- The browser keeps the project selection in its `localStorage`, not on the server.

## Desk

The Desk shows many conversations side by side, in a grid.

- At most six windows stay visible. When you open a seventh window, the oldest window goes into the dock.
- Click a window in the dock to open it again.
- Drag the dividers to change the size of the columns and rows. The browser keeps these sizes for each number of windows.
- Each window has three buttons: full screen, minimize, close.
- The server keeps which finished conversations you opened, for the Inbox and the Inbox badge, in `~/.config/t3-dashboard/seen.json`. A conversation read on one device is read on all of them.
- The server keeps which conversations are on the Desk in `~/.config/t3-dashboard/desk.json`. Every device shows the same conversations, and an opened or closed window appears on the other open tabs at once. Each device keeps its own window order, minimized windows, focused window, full screen window, sizes and Jump to history.
- In Settings, select a background for the Desk: a gradient or your own image.

### Conversation

Each Desk window contains a conversation.

- Write a message and send it with `Enter`. During a run, the message waits in the "Up next" list (dashed border). T3 Code sends it when the turn ends.
- Under each queued message, three icons: "Send now" (the same arrow as Send), edit, remove. During a run, "Send now" steers: the message goes into the current run now. After a Stop, T3 Code holds the queue, and "Send now" starts a turn with this message.
- Attach files with the paperclip, by drag and drop anywhere on the conversation (a dashed frame shows the drop area; it does not work in a subagent thread), or by paste. A chip shows each upload ("uploading", ready or "failed" with a retry button). Send waits for all uploads. The limits are those of T3 Code: 100 files, 10 MB for each image (PNG, JPEG, GIF or WebP), 50 MB for each other file and 80 MB of images in all.
- Type `@` after a space to search the files of the conversation folder. Use the arrow keys and `Enter` or `Tab` to insert `@path`. `Escape` closes the list.
- Type `/` at the start of the message to list the commands of the provider. Type `$` after a space to list its skills. The lists follow the thread folder. The menus work like the `@` list and insert `/command ` or `$skill `. Built-in T3 Code commands (`/model`, `/plan`, `/side`) are not in the lists.
- The Compact button shows the context size, for example `Compact 722k`. It appears as in T3 Code: on a Claude thread of 200k tokens or more whose prompt cache has expired (70 minutes after the last turn by default), and never during a run. `/compact` stays in the `/` list at any size. Click it, or pick `/compact`, to compact the thread.
- Stash a draft: press `Ctrl+S` in the composer (`Ctrl`, also on a Mac). On a touch screen, tap the stash button next to Attach. The text and the ready attachments go to the stash and the composer empties. A "Stash" button with the count then shows next to Attach. Click it to open the "Stashed prompts" list: each row has the first line, the age, the conversation and the number of files. Click a row, or use the arrow keys and `Enter`, to restore it: the text goes after your draft and the files return as chips. The "x" deletes an entry and frees its files. `Escape` closes the list. The stash holds 20 prompts and drops the oldest. T3 Code 0.1.6 keeps its own stash in the browser only, so the two are separate. This one is in `~/.config/t3-dashboard/stash.json` and is the same on every device: a change shows at once in every open window. T3 keeps an unsent upload for 24 hours: a restored entry older than that gets its text back and a message names the files to attach again.
- `Escape` in the message field, with no list open, leaves the field and puts the focus on the conversation. The `Ctrl` shortcuts work in the field too. Press `Escape` again on the Desk to restore a full-screen window.
- Change the model, its options and the access mode with one chip in the composer. The chip shows the provider icon, the model, the reasoning level and a bolt when Fast is on. Click it to open the panel above it:
  - The panel opens on your favorites (or on the current provider when you have none). The left rail has the favorites (star) and one icon per provider. Type in "Search models..." to search all providers.
  - Click a model, or use `↑` `↓` and `Enter`: the panel closes. `Escape` also closes it.
  - The right column lists the reasoning levels of the model. "Default" marks the default level and a check marks the current one.
  - The footer has "Standard" and "Fast" when the model has a speed option, and the access menu ("Supervised", "Auto-accept edits", "Auto", "Full access") on the right.
  - A star on a model shows a T3 Code favorite. Change favorites in T3 Code: the dashboard does not change them.
- Stop a run with the "Stop" button.
- Answer an approval: "Accept", "Accept for session" or "Decline". The dashboard does not offer "Always accept".
- Answer a question from the agent, or click "Dismiss".
- Follow the steps of the run in the conversation. Consecutive steps (reasoning, commands, tools, file changes, searches) form one group. The group of the active run shows its last 4 steps under "Working for …". Other groups are closed: click one to see its steps.
- Click a command to see its output and exit code. Click a file change to see its diff. Click a tool or a search to see its input and results. A note says when T3 Code cut a long text.
- A to-do list, a proposed plan and a notice (checkpoint, compaction, error) have their own block.
- Like T3 Code, a subagent has a row with its provider logo, title, latest line, status and time. Two or more subagents of one turn share a "N subagents" header that opens a card of rows. Click a row to open its thread in a Desk window. The window takes its name from the thread, follows a running subagent, and stays on the Desk after a reload. It goes full screen or closes, but it does not minimize. Like T3 Code, it has no message field: a bar shows the model, the run time, "Runs on its own" and "Open parent", which opens the parent thread. `@` search there uses the folder of the parent thread. The stop icon stops a running subagent.
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

## New Agent

The New Agent button (key `N`) starts a new agent.

1. Select a T3 project, or keep "No project". Without a project, the session goes into the "No project" project of T3 Code.
2. Write the task. The first line becomes the title of the session.
3. If necessary, change the model or the access mode, or attach files. `@` search does not work here: the thread does not exist yet.
4. Send. The conversation opens on the Desk.

- The proposed model is the default model of the project. If there is none, it is the default model of T3 Code.
- The favorite models of T3 Code are at the top of the list.
- The browser keeps the last project that you selected.

## Automations

The Automations tab lists the scheduled tasks of T3 Code in a table. It needs T3 Code to be connected. The list updates every 30 s while T3 Code is connected.

- The columns are: name, project, schedule, next run, last result and actions.
- The groups are: "Needs attention" (last run failed or waiting), "Today", "Upcoming" and "Paused / finished" (closed). An empty group does not appear.
- Search by name, project or schedule. The project list filters by project.
- Click a name to open the thread of the task on the Desk. Shift + click adds it to the Desk.
- Without a task, the tab shows "No automations yet" and a New Automation button.

- A routine runs at each occurrence. The row shows the project, the frequency, the next run and the status of the last run. A paused task shows "paused".
- A reminder is a task whose title starts with "Reminder: " or "Rappel : ". The prefix is not shown. T3 Code has no one-time type, so the dashboard pauses the task after its run. Older reminders paused themselves from their prompt: the dashboard still detects them. The row shows the date of the reminder.
- A webhook is a task that runs when a request arrives (see [Webhooks](#webhooks)).
- After its run, the dashboard pauses a reminder, also when the run failed (the row keeps its error). The dashboard never deletes a reminder. The row then shows "Finished" with the time of the run. Finished reminders are at the bottom of the list, the most recent first.
- Click a row to open the thread of the task.
- Each row shows the project icon and the model (provider icon and model name). The Model column is empty when the task has no model.
- To edit a task, click the pencil icon on its row. The creation form opens with the title, project, schedule, prompt, model and access mode of the task. Change what you need, then send. The kind of the task is fixed. A reminder needs a new time in the future: the form shows its next time, or no time when it already ran. Saving re-arms a paused reminder, and the dashboard keeps it enabled until its next run. A task linked to a thread runs there: its project is fixed, and a new title also renames the thread. A reminder keeps its "Reminder: " prefix.
- To delete a task, click the trash icon on its row, then click "Delete". T3 Code deletes the task. You cannot undo this action.
- When you delete a reminder, the dashboard also archives the threads of its runs. Without this, they would come back in the Inbox. A reminder linked to a conversation keeps that conversation.
- If T3 Code is too old to list the tasks, the tab shows the error. The Inbox continues to work.

### Create an automation

1. Open a new automation. Click "New Automation" in the header, to the right of New Agent, or push `⇧` + `N`. A window opens with a form.
2. Pick the kind: Routine, Reminder or Webhook.
3. Select a project, or keep "No project". The dashboard keeps this selection for the next time.
4. Set the schedule (see below), write the prompt, and pick the model. The first line of the prompt becomes the title.
5. Send. The dashboard creates the task in T3 Code directly: no agent thread is involved. The task runs with full access unless you pick another mode in the model menu. If an error occurs, the window stays open and shows the error.

- A routine repeats. Choose "At a time" (a time and the days; no day means every day) or "Every N minutes" (1 to 525600).
- A reminder runs once at the date and time you pick (1 minute to 366 days ahead). The dashboard gives the task the title "Reminder: <title>" and pauses it after its run. The prompt stays as you wrote it.
- A reminder time is in your browser's time zone. A routine time is in the time zone of the machine that runs T3 Code. The row shows the next run: check it.
- If T3 Code is off for more than 10 minutes at the time of a reminder set less than 7 days ahead, T3 Code moves it one week later.
- The new task is not linked to a thread: each run opens its own thread.
- Setup threads from older versions still show on a setup row while their agent works. The dashboard reads `~/.config/t3-dashboard/automation-threads.json` to hide their Inbox entries. It no longer writes to this file.

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

A task without a linked thread creates a new thread at each run. The dashboard hides these threads from the Inbox. It identifies them by the project, the title, the origin and the creation date of the task. You open the thread of the last run from the row of the task.

### T3 Code limits

- The minimum interval is 1 minute.
- A fixed time follows the local time of the T3 Code server. T3 Code has no time zone for each task.
- The dashboard must run to pause a reminder. If it starts again less than one hour after the run, it pauses the reminder at once. After a longer stop, an interval reminder can run again: pause it from its row.
- The dashboard pauses a reminder only when its last change is the run itself. If you turn on a finished reminder again, the dashboard leaves it on until its next run ends.
- Pausing does not stop a run that is under way: T3 Code marks a run as succeeded when it sends the prompt.

## Settings

Open Settings with the header button or the `,` key. A sidebar on the left lists the tabs. Only one tab is visible at a time.

- Appearance: "System", "Light" or "Dark" theme, and Desk background.
- Connections: status of the Linear key, change or removal of the key.
- App: how to install the dashboard as an application (Dock, Launchpad, Start menu, home screen). The steps change with the browser and the device: Safari, Chrome, Edge, iPhone and iPad, Android. Dia and Firefox do not install web apps.
- Updates: installed version, check for and installation of an update. See [install.md](install.md#updates).

## Keyboard shortcuts

The shortcuts use `Ctrl`, also on a Mac, and they work while you type in a field. They do not work while a dialog is open, except `Ctrl` + `K`. `⌘` keeps its browser meaning. `Esc` and the arrows stay plain keys: a field needs them, so they act only outside a field.

| Key | Action |
| --- | --- |
| `Ctrl` + `1`, `2`, `3` | Opens Home, Desk or Automations. |
| `Ctrl` + `K` or `⌘` + `K` | Opens or closes the "Jump to" switcher. It finds a conversation by title, project or message. Without text, it shows the agents that wait for an answer, then your recent conversations. `↑` `↓` select, `Enter` opens in the Desk. |
| `Ctrl` + `S` | In the message field of a conversation: stashes the draft. |
| `Ctrl` + `N` | Opens New Agent. |
| `Ctrl` + `⇧` + `N` | Opens a new automation (New Automation). |
| `Ctrl` + `,` | Opens Settings. |
| `Ctrl` + `B` | Opens Home. |
| `Ctrl` + `X` | Desk: closes the active window. |
| `Ctrl` + `F` | Desk: puts the active window in full screen, or takes it out of full screen. |
| `Ctrl` + `M` | Desk: minimizes the active window. |
| `Ctrl` + `Alt` + `1` to `6` | Desk: activates window 1 to 6 and puts the cursor in its message field. |
| `Esc` | Desk, outside a field: exits full screen. In the message field, it leaves the field. |
| `←` `→` `↑` `↓` | Desk, outside a field: moves the focus to the next window. |

On the Desk, typing a letter outside any field writes it in the message field of the active window: no click needed first.

On Windows and Linux, the browser keeps `Ctrl` + `N`, `Ctrl` + `⇧` + `N` and `Ctrl` + `1` to `3` for itself: use the buttons there.

A tooltip gives the name of each button and its shortcut. The animations stop if the system asks for reduced motion (`prefers-reduced-motion`).
