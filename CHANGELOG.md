# Change Log

All notable changes to the "port-manager" extension will be documented in this file.

## [Unreleased]

- Sidebar view listing listening ports (port, protocol, process, PID, user) with tooltips, refresh button, and empty/error states.
- Status bar item showing the number of listening ports; click to open the view. Hide it with `portManager.showStatusBar`.
- Settings, applied live without a reload: `portManager.refreshInterval`, `portManager.confirmBeforeKill`, `portManager.protectedPorts`, `portManager.protectedProcesses`, `portManager.showStatusBar`.
- Port listing for Linux (`ss`, `lsof`, `netstat`), macOS (`lsof`) and Windows (PowerShell, `netstat`/`tasklist`).
- Polling service that skips overlapping scans, merges IPv4/IPv6 duplicates and only notifies on real changes.
- Row actions: kill process (with confirmation), copy port, copy PID, open in browser.
- "Kill Process on Port…" command: quick pick of current ports, filterable by port number or process name.
- Cross-platform process kill: graceful then forced on macOS/Linux, `taskkill /T /F` on Windows, with typed results.
