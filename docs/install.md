# Installation and configuration

[Back to the README](../README.md)

## Installation

Prerequisite: T3 Code is installed on the same computer.

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/simonzsh/t3-dashboard/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/simonzsh/t3-dashboard/main/install.ps1 | iex
```

The script does these steps:

1. It downloads the binary for your system from the latest GitHub release.
2. It verifies the SHA-256 checksum of the binary with the `SHA256SUMS` file of the release.
3. It puts the binary in `~/.local/bin` (Windows: `%LOCALAPPDATA%\Programs\t3-dashboard`).
4. It runs `t3-dashboard install`. This command registers the service, adds the [agent rules](#agent-rules), starts the service and opens `http://127.0.0.1:4300`.

- The script looks for T3 Code (`t3`). If it is missing, the script prints a warning with the install link and command, then continues. The install does not fail.
- On macOS and Linux, the script warns you if the folder is not in the `PATH`.
- On Windows, the script adds the folder to the user `PATH`. Open a new terminal to use `t3-dashboard`.
- On Windows ARM64, the x64 binary runs in emulation.

Script options:

| Variable | Purpose |
| --- | --- |
| `T3_DASHBOARD_VERSION=1.2.3` | Installs this version, not the latest version. |
| `T3_DASHBOARD_INSTALL_DIR` | Changes the folder of the binary (macOS and Linux only). |
| `T3_DASHBOARD_NO_SERVICE=1` | Installs the binary without a service. |
| `T3_DASHBOARD_REPO` | Changes the GitHub repo of the releases. |

## Service

| System | Mechanism |
| --- | --- |
| macOS | LaunchAgent `~/Library/LaunchAgents/t3-dashboard.plist` |
| Linux | `systemd --user` unit: `~/.config/systemd/user/t3-dashboard.service` |
| Windows | "T3 Dashboard" scheduled task at logon |

- The service restarts automatically after a failure.
- `install` copies these variables into the service, if they are set at installation time: `T3_DASHBOARD_TOKEN_FILE`, `T3_DASHBOARD_CONFIG_DIR`, `T3_DASHBOARD_LINEAR_FILE`, `T3_DASHBOARD_T3_BIN`, `T3_DASHBOARD_ALLOWED_HOSTS`, `T3_SERVER_RUNTIME`, `T3CODE_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_HOME`, `XDG_CONFIG_HOME` and `T3_DASHBOARD_AGENT_RULES`. To change a value, set the variable and run `install` again.
- `install` and `update` wait at most 15 s for the new binary to answer on the port.
- If a different program or an older dashboard uses the port, the command stops with this error: "Port 4300 is used by another program or an older dashboard." Stop this program, or install with `--port <n>`.
- On Linux, `install` needs `systemctl`. Without `systemctl`, use `t3-dashboard start`.
- On Linux, run `loginctl enable-linger $USER` to start the service at boot, without a login session.
- On Windows, the task does not need administrator rights. If Windows refuses the task, the installer uses the user `Run` key.
- On Windows, file permissions (mode 600) do not apply. The config folder stays in your profile.

## Agent rules

`install` adds a block of rules for automations to the global instruction file of each agent. The block tells the agent to create reminders, routines and webhooks with the `schedule_task` tool of T3 Code.

| Agent | File | Written |
| --- | --- | --- |
| Claude Code | `~/.claude/CLAUDE.md` | Always. A missing file is created. |
| Codex | `~/.codex/AGENTS.md` | Always. A missing file is created. |
| Antigravity | `~/.gemini/GEMINI.md` | Only if `~/.gemini` exists. |
| OpenCode | `~/.config/opencode/AGENTS.md` | Only if `~/.config/opencode` exists. |

Cursor has no global rules file, so it gets no block. The dashboard never creates the folder of an agent that is not installed. T3 Code can point `GEMINI_HOME` at a private profile, so whether Antigravity reads `~/.gemini/GEMINI.md` when T3 Code starts it is not verified.

- The block sits between the lines `<!-- t3-dashboard:begin -->` and `<!-- t3-dashboard:end -->`. The dashboard changes only the text between them. Do not edit it: the next start replaces it.
- The compiled binary refreshes the block at each start, so an update brings the new text.
- If the markers are damaged (a begin without an end), the dashboard leaves the file as it is and logs the problem.
- To stop this, set `T3_DASHBOARD_AGENT_RULES=off` before `install` and in the service. Remove the block by hand, or run `uninstall`.
- `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_HOME` and `XDG_CONFIG_HOME` (for OpenCode) move the files, as they do for each agent.
- If a file already loads another one with an `@` line (for example `@~/.codex/AGENTS.md`), the block goes only in the loaded file, so the agent does not read it twice.
- `uninstall` removes the block from every file that has it. A file that holds nothing else is deleted.

## Commands

```sh
t3-dashboard install [--port 4300] [--no-open]       # registers and starts the service
t3-dashboard uninstall                               # stops and removes the service, keeps the config
t3-dashboard update [--check]                        # installs the latest release
t3-dashboard start [--port 4300] [--log <file>]      # runs in the foreground, without a service
t3-dashboard --version
t3-dashboard --help
```

Without a command, `t3-dashboard` runs `start`. `install` and `update` refuse to run outside the compiled binary.

## First start

1. The dashboard looks for `t3`. It creates its own access token with `t3 auth session issue`. It keeps this token in `~/.config/t3-dashboard/auth.json` (mode 600). You do not have to do anything.
2. If T3 Code is not installed, a full screen shows the install link (<https://t3.codes>) and the official install command: `curl -fsSL https://t3.codes/install.sh | sh` on macOS and Linux, `irm https://t3.codes/install.ps1 | iex` on Windows. The desktop app from t3.codes works too. If T3 Code is installed but stopped, the screen shows the command `t3 start`. Install or start T3 Code, then click "Retry". The dashboard appears without a page reload.
3. If the token creation fails, the screen gives the exact command. Run it, then paste the token in the field.
4. To use Linear, connect it in Settings (see [Linear](#linear)).

## Linear

Linear is optional. Only the Dashboard uses it. You connect it in Settings.

1. In Linear, open Settings, Account, Security & access. In "Personal API keys", click "New API key". Direct link: <https://linear.app/settings/account/security>.
2. In Settings, open the Linear section, paste the key and click "Connect". The server verifies the key with Linear before it saves it. The Linear card then shows on the Dashboard.
3. The Linear section shows the status of the key. You can change or remove the key there.

The key is the only setting. The Linear card of the Dashboard shows your urgent, due and unread items, for all the teams in the Linear workspace. The card is not shown until Linear is connected.

The server keeps the key in `~/.config/t3-dashboard/linear.json` (mode 600). It never sends the key back to the browser, only its last 4 characters. It keeps the answer in memory for 60 s. The "Refresh" button of the Linear card reads Linear again immediately.

File format:

```json
{ "apiKey": "lin_api_..." }
```

- An old file can contain `teams` and `unlisted`. The server ignores them and removes them at the next write.
- The server still reads the old `{ "workspaces": [...] }` format. It uses the first key that is not empty and ignores the others. The first save from Settings writes the simple format.

## Updates

### From the dashboard

The dashboard looks for a new GitHub release at startup, then every hour. A network error or a missing release shows nothing.

1. When a more recent version exists, the "Update vX.Y.Z" button appears at the bottom of the sidebar. On a phone, the Settings button of the header shows a dot instead: the update is in Settings, Updates.
2. Click this button, then confirm.
3. The dashboard does the same update as `t3-dashboard update`, then restarts.
4. The page waits for the new dashboard and reloads automatically. If the update fails, the page shows the error.

In Settings, the "About" section shows the installed version. The "Check for updates" button looks for a new version immediately. If a new version exists, the "Update to vX.Y.Z" button appears.

- No update occurs without a click.
- A dashboard started with `start` restarts automatically with the same arguments.
- A `dev` version does not look for updates automatically. A `dev` version, or a dashboard that runs outside the compiled binary, cannot update: the page tells you why.

### From a terminal

```sh
t3-dashboard update
```

The command downloads the latest GitHub release and verifies the SHA-256 checksum. It replaces the binary and restarts the service. With `--check`, it only tells you if a more recent version exists.

## Logs

| System | Location |
| --- | --- |
| Linux | `journalctl --user -u t3-dashboard -f` |
| macOS | `~/Library/Logs/t3-dashboard/dashboard.log` |
| Windows | `%LOCALAPPDATA%\t3-dashboard\dashboard.log` |

The logs never contain a token or an API key. The `dashboard.pid` file is in the same folder as the log. On Linux, this folder is `~/.local/state/t3-dashboard`.

## Uninstall

1. Run `t3-dashboard uninstall`. The command stops and removes the service, and removes the agent rules block from the two files (the rest of the files stays).
2. Delete the binary: `rm ~/.local/bin/t3-dashboard`. On Windows, delete the `%LOCALAPPDATA%\Programs\t3-dashboard` folder.
3. If necessary, delete the config: `rm -r ~/.config/t3-dashboard`. On Windows, this folder is `%USERPROFILE%\.config\t3-dashboard`.

## Remote access

The server listens only on `127.0.0.1`. By default, it refuses `Host` and `Origin` headers other than `127.0.0.1` and `localhost`.

To open the dashboard from a different device, use a proxy on a private network, for example `tailscale serve`:

1. Expose the port with `tailscale serve`.
2. Put the machine name in `T3_DASHBOARD_ALLOWED_HOSTS`, for example `box.tailnet.ts.net`.
3. Run `t3-dashboard install` again. The service gets the variable.

The dashboard has no authentication. Each person who can reach the address can control your agents. Open access only on a private network.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4300` | Local port. The server still listens on `127.0.0.1`. `--port` has priority. An empty value, an invalid value or `0` gives `4300`. |
| `T3_DASHBOARD_CONFIG_DIR` | `~/.config/t3-dashboard` | Folder of `auth.json`, `linear.json` and `automation-threads.json`. |
| `T3_DASHBOARD_TOKEN_FILE` | none | JSON file with the `token` field. Without it, the dashboard keeps its own token. With it, the setup screen refuses a pasted token: put the token in this file. |
| `T3_DASHBOARD_ALLOWED_HOSTS` | none | Comma-separated host names, without a port. They are added to `127.0.0.1` and `localhost` for the `Host` and `Origin` headers. See [Remote access](#remote-access). |
| `T3_DASHBOARD_T3_BIN` | automatic search | Absolute path of `t3`. |
| `T3_DASHBOARD_LINEAR_FILE` | `<config>/linear.json` | File of the Linear config. |
| `T3CODE_HOME` | `~/.t3` | Base folder of T3 Code. The dashboard also gives it to `t3 auth session issue`. |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Folder of the `CLAUDE.md` file that gets the agent rules. |
| `CODEX_HOME` | `~/.codex` | Folder of the `AGENTS.md` file that gets the agent rules. |
| `GEMINI_HOME` | `~/.gemini` | Folder of the Antigravity `GEMINI.md` file that gets the agent rules. |
| `XDG_CONFIG_HOME` | `~/.config` | Base of the OpenCode folder (`opencode/AGENTS.md`) that gets the agent rules. |
| `T3_DASHBOARD_AGENT_RULES` | on | `off` stops `install` and the start of the binary from writing the agent rules. `uninstall` still removes them. |
| `T3_DASHBOARD_AUTOMATION_GUARD` | off in a dev build | `on` starts the automation guard in a version that Bun starts, for a test against the real T3 Code. The compiled binary always runs it. |
| `T3_SERVER_RUNTIME` | `<T3CODE_HOME>/userdata/server-runtime.json` | JSON file with the `origin` field. The dashboard reads it again at each connection to T3. Fallback: `http://127.0.0.1:3773`. |
| `T3_DASHBOARD_REPO` | `simonzsh/t3-dashboard` | GitHub repo of the releases, for `update`, the hourly check and the install scripts. |
