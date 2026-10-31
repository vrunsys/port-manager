# Port Manager

See which processes are listening on local ports, and stop them, from the VS Code sidebar.

## What it does

- Lists listening ports in the **Port Manager** sidebar: port, name, process, PID. Hover a row for the user, command and folder.
- Shows the count in the status bar (`$(plug) N`) and on the sidebar icon.
- **Stop** a process (with confirmation), **Open in Browser**, **Copy Port**, **Copy PID**.
- **Filter**, **Sort** (port, PID, name), **Rename** a port (for example `frontend`), and **Show Running Only** to hide rows whose process can't be seen.
- **Port Manager: Kill Process on Port…** in the Command Palette stops a process from the keyboard.
- Refreshes automatically while the view or status bar is visible, and pauses when the window isn't focused.

## Requirements

- VS Code 1.85 or newer, or an editor built on it (Cursor, Antigravity).
- These tools on the machine where the extension runs:

| OS | Uses |
|---|---|
| Linux | `ss`, then `lsof`, then `netstat`; `ps` |
| macOS | `lsof`, `ps` (included) |
| Windows | PowerShell, then `netstat` and `tasklist` |

Ports of other users' processes show as "process hidden" unless VS Code has enough rights.

## Settings

They apply immediately, with no reload.

| Setting | Default | |
|---|---|---|
| `portManager.refreshInterval` | `2` | Seconds between scans (minimum 1). |
| `portManager.confirmBeforeKill` | `true` | Ask before stopping a process. |
| `portManager.protectedPorts` | `[]` | Ports that can never be stopped, e.g. `[22, 5432]`. |
| `portManager.protectedProcesses` | `[]` | Process names that can never be stopped, e.g. `["sshd"]`. |
| `portManager.showStatusBar` | `true` | Show the port count in the status bar. |

The first three safety settings can only be set in your user or remote settings, not in a workspace, so a cloned repo can't switch them off.

## Safety

Port Manager only stops a process when you ask, and it refuses these, with a reason:

- Anything you protected in the settings.
- System processes (PID 0, 1, and 4 on Windows), VS Code itself, and critical OS processes such as `launchd`, `systemd`, `lsass` and `svchost`. No setting overrides this.
- A process owned by another user always asks again ("Stop Anyway"), even if confirmations are off.

It never raises its own privileges. If the OS says permission denied, it tells you what to run yourself (`sudo kill <pid>`, or restart VS Code as administrator). Right before stopping, it scans again to make sure the PID still holds that port.

## Remote, WSL and containers

The extension runs where your files are, so in Remote - SSH, WSL and Dev Containers it shows and stops the **remote** machine's ports. Open in Browser is forwarded to your computer. More in [docs/remote-and-wsl.md](docs/remote-and-wsl.md).

## Troubleshooting

If the list looks wrong, open **Output > Port Manager**. It logs failed tools, fallbacks and refused stops.

## Status

Early development. Windows and macOS support has been tested against sample output, not on real machines.

## Development

```
npm install
npm test                       # unit tests (vitest), no OS tools needed
npm run test:integration       # real ports and real kills on this OS
npm run check-types && npm run lint
```

Press `F5` to start an Extension Development Host. Tests live in `src/test/` and mirror `src/`; saved tool output is in `src/test/fixtures/` ([what is real](src/test/fixtures/README.md)). CI runs everything on Linux, macOS and Windows and uploads the `.vsix` as an artifact on `main`.

Before publishing, `package.json` still needs a `publisher`, a `repository` URL and a license.
