# Usage

[Back to the README](../README.md)

The dashboard has three tabs: Agents, Desk and Board. The header contains the New Agent and New Automation buttons and the settings (Settings).

## Agents

The Agents tab shows one card for each T3 Code session.

- The cards are grouped by T3 project. Each group shows the icon and the name of the project.
- In a group, the agents pinned in T3 Code come first, with a small pin. Then the order is: waiting, working, finished, idle.
- The groups follow the alphabetical order of the projects. This order never changes. A yellow dot near the name shows that an agent in the group is waiting.
- A card shows the provider (Claude or Codex), the title, the status and the time of the last activity. If the agent waits for an approval or an answer, the card tells you.
- A finished agent ("settled" in T3 Code) goes into a collapsed section below its group. It disappears after 3 days without activity.
- Archived or deleted sessions, sub-agents and the threads of scheduled tasks (see [Automations](#automations)) do not appear.
- Click a card to open the conversation on the Desk. Shift + click adds it to the Desk and keeps the current tab.
- The "Add to Desk" button adds the card to the Desk. A second click removes it.
- The "Open in T3 Code" link opens the session in T3 Code.
- The buttons are at the bottom right of the card, after the status and the time: T3 (icon only), Settle, then Add to Desk.
- The "Settle" button (box icon) moves a finished agent to "Recently settled", as T3 Code does. It does not exist for an agent that works or waits.
- The cards in "Recently settled" are grayed out. You can see the difference from the other cards immediately.
- In "Recently settled", the "Unsettle" button puts the agent back in the list.

The cards change status live, without a page reload.

## Desk

The Desk shows many conversations side by side, in a grid.

- At most six windows stay visible. When you open a seventh window, the oldest window goes into the dock.
- Click a window in the dock to open it again.
- Drag the dividers to change the size of the columns and rows. The browser keeps these sizes for each number of windows.
- Each window has three buttons: full screen, minimize, close.
- The server keeps which conversations are on the Desk in `~/.config/t3-dashboard/desk.json`. Every device shows the same conversations, and an opened or closed window appears on the other open tabs at once. Each device keeps its own window order, minimized windows, focused window, full screen window, sizes and Jump to history.
- In Settings, select a background for the Desk: a gradient or your own image.

### Conversation

Each Desk window contains a conversation.

- Write a message and send it with `Enter`. During a run, the message waits in the "Up next" list (dashed border). T3 Code sends it when the turn ends.
- Under each queued message, three icons: send (Enter arrow), edit, remove. During a run, the send icon steers: the message goes into the current run now. After a Stop, T3 Code holds the queue, and the send icon starts a turn with this message.
- Attach files with the paperclip, by drag and drop on the composer, or by paste. A chip shows each upload ("uploading", ready or "failed" with a retry button). Send waits for all uploads. The limits are those of T3 Code: 100 files, 10 MB for each image (PNG, JPEG, GIF or WebP), 50 MB for each other file and 80 MB of images in all.
- Type `@` after a space to search the files of the conversation folder. Use the arrow keys and `Enter` or `Tab` to insert `@path`. `Escape` closes the list.
- Type `/` at the start of the message to list the commands of the provider. Type `$` after a space to list its skills. The lists follow the thread folder. The menus work like the `@` list and insert `/command ` or `$skill `. Built-in T3 Code commands (`/model`, `/plan`, `/side`) are not in the lists.
- The Compact button shows the context size, for example `Compact 722k`. It appears as in T3 Code: on a Claude thread of 200k tokens or more whose prompt cache has expired (70 minutes after the last turn by default), and never during a run. `/compact` stays in the `/` list at any size. Click it, or pick `/compact`, to compact the thread.
- Stash a draft: press `Ctrl+S` in the composer (`Ctrl`, also on a Mac). On a touch screen, tap the stash button next to Attach. The text and the ready attachments go to the stash and the composer empties. A "Stash" button with the count then shows next to Attach. Click it to open the "Stashed prompts" list: each row has the first line, the age, the conversation and the number of files. Click a row, or use the arrow keys and `Enter`, to restore it: the text goes after your draft and the files return as chips. The "x" deletes an entry and frees its files. `Escape` closes the list. The stash holds 20 prompts and drops the oldest. T3 Code 0.1.6 keeps its own stash in the browser only, so the two are separate. This one is in `~/.config/t3-dashboard/stash.json` and is the same on every device: a change shows at once in every open window. T3 keeps an unsent upload for 24 hours: a restored entry older than that gets its text back and a message names the files to attach again.
- `Escape` in the message field, with no list open, leaves the field and puts the focus on the conversation. The `Ctrl` shortcuts work in the field too. Press `Escape` again on the Desk to restore a full-screen window.
- Change the model, its options and the access mode with one chip in the composer. The chip shows the provider icon, the model, the reasoning level and a bolt when Fast is on. Click it to open the panel above it:
  - The left rail has the favorites (star) and one icon per provider. Type in "Search models..." to search all providers.
  - Click a model, or use `↑` `↓` and `Enter`. `⌘` + `1` to `9` (`Alt` + `1` to `9` on Windows and Linux) picks the n-th model in the list. `Escape` closes the panel.
  - The right column lists the reasoning levels of the model. "Default" marks the default level and a check marks the current one.
  - The footer has "Standard" and "Fast" when the model has a speed option, and the access menu ("Supervised", "Auto-accept edits", "Auto", "Full access") on the right.
  - A star on a model shows a T3 Code favorite. Change favorites in T3 Code: the dashboard does not change them.
- Stop a run with the "Stop" button.
- Answer an approval: "Accept", "Accept for session" or "Decline". The dashboard does not offer "Always accept".
- Answer a question from the agent, or click "Dismiss".
- Follow the steps of the run in the conversation. Consecutive steps (reasoning, commands, tools, file changes, searches) form one group. The group of the active run shows its last 4 steps under "Working for …". Other groups are closed: click one to see its steps.
- Click a command to see its output and exit code. Click a file change to see its diff. Click a tool or a search to see its input and results. A note says when T3 Code cut a long text.
- A to-do list, a proposed plan and a notice (checkpoint, compaction, error) have their own block.
- A subagent has its own block with its status and time. Click it to see its result and its steps. "Open thread" opens its thread in a Desk window. The window takes its name from the thread, follows a running subagent, and stays on the Desk after a reload. It goes full screen or closes, but it does not minimize. `@` search there uses the folder of the parent thread. The stop icon stops a running subagent.
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

`GET /api/threads/:id/attachments/:attachmentId` serves an attachment. A `.html` file is a rendered, themed page, unless the URL has `?raw=1`: file chips and "Edit from here" use `?raw=1`, so a file that you send is never shown as a page.

## New Agent

The New Agent button (key `N`) starts a new agent.

1. Select a T3 project, or keep "No project". Without a project, the session goes into the "No project" project of T3 Code.
2. Write the task. The first line becomes the title of the session.
3. If necessary, change the model or the access mode, or attach files. `@` search does not work here: the thread does not exist yet.
4. Send. The conversation opens on the Desk.

- The proposed model is the default model of the project. If there is none, it is the default model of T3 Code.
- The favorite models of T3 Code are at the top of the list.
- The browser keeps the last project that you selected.

## Board

The Board tab shows the Linear tickets that are assigned to you. It needs a Linear API key: see [install.md](install.md#linear).

- There is one column for each Linear status. In a column, the tickets are grouped by Linear project. The tickets without a project go into "No project".
- In a group, the tickets are sorted by priority, then by update date.
- Click a ticket to open it in Linear.
- The "Refresh" button reads the tickets again immediately.

### Give a ticket to an agent

1. Click the "Assign to an agent" button of the ticket. The New Agent window opens with the ticket.
2. Select the T3 project. The browser keeps the last project for each Linear team and selects it first.
3. Select the model and the access mode.
4. If necessary, add instructions or files.
5. Send. The session has the number and the title of the ticket. It goes onto the Desk, and the Board stays visible.
6. Click "View on Desk" to see the conversation.

The browser keeps the project selection in its `localStorage`, not on the server.

## Automations

The right column of the Agents tab lists the scheduled tasks of T3 Code. It appears when T3 Code is connected. It updates every 30 s while the tab is open.

- A routine runs at each occurrence. The row shows the project, the frequency, the next run and the status of the last run. A paused task shows "paused".
- A reminder is a task with a title that starts with "Reminder: " or "Rappel : ". The row shows the date of the reminder. The prefix is not shown.
- After its run, a reminder pauses. The row then shows "Finished" with the time of the run. Finished reminders are at the bottom of the list, the most recent first.
- Click a row to open the thread of the task.
- Each row shows the project icon. To rename a task, click the pencil icon on its row, change the title, then push `Enter`. The dashboard also renames the linked thread. It keeps the prefix of a reminder. You cannot rename a webhook task.
- To delete a task, click the trash icon on its row, then click "Delete". T3 Code deletes the task. You cannot undo this action.
- If T3 Code is too old to list the tasks, the column shows the error. The agent grid continues to work.

### Create a reminder or a routine

1. Open a new automation. Click "New Automation" in the header, to the right of New Agent, or push `⇧` + `N`. A window opens.
2. Write the request in the text box. Example: "Every weekday at 9 AM, summarize my Linear tickets". It can have many lines.
3. Select a project, or keep "No project". The dashboard keeps this selection for the next time.
4. Click "Create" in the window.

The dashboard creates a thread with the default model of the project. This thread tells the agent to create the task with the T3 Code `schedule_task` tool. The window closes. If an error occurs, the window stays open and shows the error.

- A one-time request becomes a reminder. The agent adds the "Reminder: " prefix to the title. At the end, it pauses the task. It does not delete it.
- A repeated request becomes a routine.
- While the agent prepares the task, the thread from the window is not in the grid. It appears at the top of the column, on a "running" or "waiting for your reply" row. Click the row to open the thread.
- When the task exists, the row becomes the row of the task. You open the thread from this row.
- If the thread is idle and has no task (failed creation, or deleted task), it goes back into the grid with the result.
- The dashboard keeps the list of these threads in `~/.config/t3-dashboard/automation-threads.json`.

### From a conversation

You can also ask for a task in a normal conversation. By default, `schedule_task` links the task to this conversation, and each run posts in it. The conversation stays in the grid. To open a new thread at each run, ask the agent to use `bindToCurrentThread: false` (see the next section). For a one-time reminder, write: "Create a reminder: the title starts with "Reminder: ", and pause the task after its run".

### Threads of tasks without a linked conversation

A task without a linked thread creates a new thread at each run. The dashboard hides these threads from the grid. It identifies them by the project, the title, the origin and the creation date of the task. You open the thread of the last run from the row of the task.

### T3 Code limits

- The minimum interval is 1 minute.
- A fixed time follows the local time of the T3 Code server. T3 Code has no time zone for each task.
- If the agent does not pause the task of a reminder, the reminder repeats.

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
| `Ctrl` + `1`, `2`, `3` | Opens Agents, Desk or Board. |
| `Ctrl` + `K` or `⌘` + `K` | Opens or closes the "Jump to" switcher. It finds a conversation by title, project or message. Without text, it shows the agents that wait for an answer, then your recent conversations. `↑` `↓` select, `Enter` opens in the Desk. |
| `Ctrl` + `S` | In the message field of a conversation: stashes the draft. |
| `Ctrl` + `N` | Opens New Agent. |
| `Ctrl` + `⇧` + `N` | Opens a new automation (New Automation). |
| `Ctrl` + `,` | Opens Settings. |
| `Ctrl` + `X` | Desk: closes the active window. |
| `Ctrl` + `F` | Desk: puts the active window in full screen, or takes it out of full screen. |
| `Ctrl` + `M` | Desk: minimizes the active window. |
| `Ctrl` + `Alt` + `1` to `6` | Desk: activates window 1 to 6 and puts the cursor in its message field. |
| `Esc` | Desk, outside a field: exits full screen. In the message field, it leaves the field. |
| `←` `→` `↑` `↓` | Desk, outside a field: moves the focus to the next window. |

On the Desk, typing a letter outside any field writes it in the message field of the active window: no click needed first.

On Windows and Linux, the browser keeps `Ctrl` + `N`, `Ctrl` + `⇧` + `N` and `Ctrl` + `1` to `3` for itself: use the buttons there.

A tooltip gives the name of each button and its shortcut. The animations stop if the system asks for reduced motion (`prefers-reduced-motion`).
