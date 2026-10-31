# Port Manager

See which processes are listening on local ports, right from the VS Code sidebar.

## Features

- **Port Manager** activity bar icon with a **Listening Ports** view.
- Each row shows the port, protocol, process name, PID and user. Hover a row for the bind address, full command line and working directory (when known).
- The list refreshes automatically every 2 seconds while the view is visible, and stops polling while it is hidden. Use the refresh button in the view title bar (or the **Port Manager: Refresh** command) to refresh immediately.
- Clear states for scanning, no listening ports, and errors (tool missing, permission denied, timeout). After a failed refresh the last known list stays visible.
- IPv4 and IPv6 sockets of the same process are shown as one row.

## Requirements

| OS | Uses |
|---|---|
| Linux | `ss`, falling back to `lsof`, then `netstat`; `ps` for users and command lines |
| macOS | `lsof` and `ps` (both ship with macOS) |
| Windows | PowerShell (`Get-NetTCPConnection`), falling back to `netstat` and `tasklist` |

Processes owned by other users may be hidden unless VS Code runs with enough privileges; such ports are listed as "process hidden".

## Status

Early development. Not yet available:

- Stopping a process from the view (the cross-platform kill logic exists, the UI does not).
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
