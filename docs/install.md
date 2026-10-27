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
4. It runs `t3-dashboard install`. This command registers the service, starts it and opens `http://127.0.0.1:4300`.

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
- `install` copies these variables into the service, if they are set at installation time: `T3_DASHBOARD_TOKEN_FILE`, `T3_DASHBOARD_CONFIG_DIR`, `T3_DASHBOARD_LINEAR_FILE`, `T3_DASHBOARD_T3_BIN`, `T3_DASHBOARD_ALLOWED_HOSTS`, `T3_SERVER_RUNTIME` and `T3CODE_HOME`. To change a value, set the variable and run `install` again.
- `install` and `update` wait at most 15 s for the new binary to answer on the port.
- If a different program or an older dashboard uses the port, the command stops with this error: "Port 4300 is used by another program or an older dashboard." Stop this program, or install with `--port <n>`.
- On Linux, `install` needs `systemctl`. Without `systemctl`, use `t3-dashboard start`.
- On Linux, run `loginctl enable-linger $USER` to start the service at boot, without a login session.
- On Windows, the task does not need administrator rights. If Windows refuses the task, the installer uses the user `Run` key.
- On Windows, file permissions (mode 600) do not apply. The config folder stays in your profile.

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
2. If T3 Code is stopped or not installed, a full screen tells you what to do. Start or install T3 Code, then click "Retry". The dashboard appears without a page reload.
3. If the token creation fails, the screen gives the exact command. Run it, then paste the token in the field.
4. In the Board tab, a card tells you how to connect Linear.

## Linear

Linear is optional. Only the Board uses it. You configure everything from the dashboard.

1. In Linear, open Settings, Account, Security & access. In "Personal API keys", click "New API key". Direct link: <https://linear.app/settings/account/security>.
2. In the Board tab, paste the key and click "Connect". The server verifies the key with Linear before it saves it.
3. In Settings, the Linear section shows the status of the key. You can change or remove the key there.

The key is the only setting. The Board shows the assigned tickets of all the teams in the Linear workspace. If the key covers many companies, their tickets appear together.

The server keeps the key in `~/.config/t3-dashboard/linear.json` (mode 600). It never sends the key back to the browser, only its last 4 characters. It keeps the tickets in memory for 60 s. The Board "Refresh" button reads the tickets again immediately.

File format:

```json
{ "apiKey": "lin_api_..." }
```

- An old file can contain `teams` and `unlisted`. The server ignores them and removes them at the next write.
- The server still reads the old `{ "workspaces": [...] }` format. It uses the first key that is not empty and ignores the others. The first save from Settings writes the simple format.

## Updates

### From the dashboard

The dashboard looks for a new GitHub release at startup, then every hour. A network error or a missing release shows nothing.

1. When a more recent version exists, the "Update vX.Y.Z" button appears in the header.
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

1. Run `t3-dashboard uninstall`. The command stops and removes the service.
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
| `T3_SERVER_RUNTIME` | `<T3CODE_HOME>/userdata/server-runtime.json` | JSON file with the `origin` field. The dashboard reads it again at each connection to T3. Fallback: `http://127.0.0.1:3773`. |
| `T3_DASHBOARD_REPO` | `simonzsh/t3-dashboard` | GitHub repo of the releases, for `update`, the hourly check and the install scripts. |
