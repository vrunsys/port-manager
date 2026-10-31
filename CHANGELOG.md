# Change Log

All notable changes to the "port-manager" extension will be documented in this file.

## [Unreleased]

- Hardening from a code review: OS-critical processes can never be stopped; every stop is preceded by a fresh scan that confirms the PID still holds the port; Windows `taskkill /T` refuses ancestors of the extension host; Linux falls back to the next tool when one fails, not only when it is missing; a failing `ps` no longer blocks the list; PowerShell failures are remembered for five minutes and logged to Output > Port Manager; no console window flashes on Windows; Unix tools run with English messages; polling pauses when the window is unfocused and backs off after slow scans; the status bar item appears at startup; the safety settings can no longer be set per workspace.
- Sidebar view listing listening ports (port, protocol, process, PID, user) with tooltips, refresh button, and empty/error states.
- **Show Running Only** toggle in the title bar to hide rows whose process is hidden; the header, badge and status bar count follow it.
- Port rows read like server cards (port, name, process and PID), with inline rename, open and stop buttons; a live **Filter** search, **Sort** by port, PID or name, a running count in the view header and on the sidebar icon, and **Rename** to give ports names that persist.
- Status bar item showing the number of listening ports; click to open the view. Hide it with `portManager.showStatusBar`.
- Safety guards: system PIDs (0, 1, Windows 4), the extension host and its parent, and protected ports/processes are refused before any confirmation, with the reason. Processes owned by another user always get a stronger confirmation. Permission-denied results explain how to use `sudo` / administrator rights without Port Manager ever elevating itself.
- Runs in the workspace extension host, so Remote - SSH, WSL and Dev Containers manage the remote ports (see `docs/remote-and-wsl.md`).
- Settings, applied live without a reload: `portManager.refreshInterval`, `portManager.confirmBeforeKill`, `portManager.protectedPorts`, `portManager.protectedProcesses`, `portManager.showStatusBar`.
- Port listing for Linux (`ss`, `lsof`, `netstat`), macOS (`lsof`) and Windows (PowerShell, `netstat`/`tasklist`).
- Polling service that skips overlapping scans, merges IPv4/IPv6 duplicates and only notifies on real changes.
- Row actions: kill process (with confirmation), copy port, copy PID, open in browser.
- "Kill Process on Port…" command: quick pick of current ports, filterable by port number or process name.
- Fixed Windows `netstat` parsing on systems whose "listening" label has several words (for example Italian "IN ASCOLTO"), which previously found no ports.
- Tests run with vitest and saved tool output (`npm test` needs no VS Code or OS tools); `scripts/capture-fixtures.js` records real fixtures.
- Cross-platform process kill: graceful then forced on macOS/Linux, `taskkill /T /F` on Windows, with typed results.
