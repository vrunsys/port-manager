# Port Manager

See which processes are listening on local ports, right from the VS Code sidebar.

## Features

- **Port Manager** activity bar icon with a **Listening Ports** view.
- Each row shows the port, protocol, process name, PID and user. Hover a row for the bind address, full command line and working directory (when known).
- A status bar item shows `$(plug) N`, the number of listening ports (the same rows the view lists). Click it to open the Port Manager view. On an error it keeps the last known count and turns yellow, with the reason in its tooltip.
- The list refreshes automatically every 2 seconds while the view is visible or the status bar item is shown, and stops polling when neither is on screen. Use the refresh button in the view title bar (or the **Port Manager: Refresh** command) to refresh immediately.
- Row actions, as inline buttons and in the right-click menu:
  - **Open in Browser** opens `http://localhost:<port>`.
  - **Kill Process** asks for confirmation (process name and PID), then stops the process: a graceful stop first, forced after a few seconds on macOS/Linux, and `taskkill /T /F` on Windows. It shows a clear message if the process is already gone or you lack permission.
  - **Copy Port** and **Copy PID** (right-click menu).
  - Kill and Copy PID are not offered for rows whose process is hidden.
- **Port Manager: Kill Process on Port…** in the Command Palette opens a quick pick of the current ports. Type a port number or process name to filter, press Enter, then confirm. It uses the same confirmation and kill logic as the tree, so a port can be stopped entirely from the keyboard.
- Clear states for scanning, no listening ports, and errors (tool missing, permission denied, timeout). After a failed refresh the last known list stays visible.
- IPv4 and IPv6 sockets of the same process are shown as one row.

## Requirements

| OS | Uses |
|---|---|
| Linux | `ss`, falling back to `lsof`, then `netstat`; `ps` for users and command lines |
| macOS | `lsof` and `ps` (both ship with macOS) |
| Windows | PowerShell (`Get-NetTCPConnection`), falling back to `netstat` and `tasklist` |

Processes owned by other users may be hidden unless VS Code runs with enough privileges; such ports are listed as "process hidden".

## Settings

| Setting | Default | |
|---|---|---|
| `port-manager.showStatusBar` | `true` | Show the port count in the status bar. Turning it off also stops background polling when the view is closed. |

## Status

Early development. Not yet available:

- A setting for the refresh interval.
- Windows support has only been tested against sample output, not on a real Windows machine. `scripts/spike-windows-ports.js` measures the PowerShell path on Windows.

## Development

```
npm install
npm run compile-tests   # build tests into out/
npm run check-types && npm run lint
```

Press `F5` in VS Code to launch the Extension Development Host, then open the Port Manager icon in the activity bar.

Tests that do not need VS Code (parsers, adapters, service, formatting) can run directly with mocha after `npm run compile-tests`. `npm test` runs the full suite inside VS Code.
