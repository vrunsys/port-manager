# Port Manager

See which processes are listening on local ports, right from the VS Code sidebar.

## Features

- **Port Manager** activity bar icon with a **Listening Ports** view.
- Each row reads like a small server card: the **port** first, then the **name**, with the process and PID in grey, for example `5204  hellooajo` over `node · pid 27510`. Rows without a name of their own show where they listen instead (`[::1] · pid 27509`). Hover a row for the user, full command line and working directory (when known).
- The view header shows how many ports are running and the sort order (`8 running · Sort: PID`), and the sidebar icon carries the same count as a badge.
- **Filter** (search icon in the view's title bar) opens a search box that narrows the list as you type, by port, name, process, PID, address or command; Enter keeps the search, Escape restores the previous one, and a clear button appears while a search is active. **Sort** (sort icon) orders the list by Port, PID or Name; the choice is remembered.
- **Show Running Only** (filter icon in the title bar) hides the rows whose process Port Manager cannot see, such as other users' services, which would show as "Unknown process". The header says how many are tucked away (`5 running · 3 hidden`), the status bar count follows the list, and the same button switches back to **Show All Ports**. The choice is remembered; by default everything is shown.
- **Rename** (pencil on each row) gives a port a name such as `frontend`. The name is remembered per port, shown on the row and in the stop confirmation, searchable, and used by **Kill Process on Port…**.
- A status bar item shows `$(plug) N`, the number of listening ports (the same rows the view lists, so it respects **Show Running Only**). It appears as soon as VS Code has finished starting. Click it to open the Port Manager view. On an error it keeps the last known count and turns yellow, with the reason in its tooltip.
- The list refreshes automatically (every 2 seconds by default, see Settings) while the view is visible or the status bar item is shown, and stops polling when neither is on screen. Polling also pauses while the VS Code window is not focused, and waits at least four times as long as the last scan took, so it stays cheap when a tool is slow. Use the refresh button in the view title bar (or the **Port Manager: Refresh** command) to refresh immediately.
- Row actions, as inline buttons (pencil, open, stop) and in the right-click menu:
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

All settings apply immediately, without reloading the window.

| Setting | Default | |
|---|---|---|
| `portManager.refreshInterval` | `2` | Seconds between scans while the view or status bar item is on screen. Minimum 1. |
| `portManager.confirmBeforeKill` | `true` | Ask for confirmation before stopping a process. |
| `portManager.protectedPorts` | `[]` | Ports that can never be stopped from the extension, e.g. `[22, 5432]`. |
| `portManager.protectedProcesses` | `[]` | Process names that can never be stopped, e.g. `["sshd", "postgres"]`. Case and `.exe` are ignored, and the executable name from the command line is matched too (so `node` works even where the OS reports a thread name). |
| `portManager.showStatusBar` | `true` | Show the port count in the status bar. Turning it off also stops background polling when the view is closed. |

Protected rows stay listed but have no Kill button, and their tooltip says why. Kill and **Kill Process on Port…** refuse them even with confirmations switched off.

`confirmBeforeKill`, `protectedPorts` and `protectedProcesses` are *machine-overridable*: set them in your user (or Remote) settings. A workspace's own `.vscode/settings.json` cannot change them, so a cloned repository cannot switch the safety checks off.

## Safety

Port Manager only stops a process when you ask, and it refuses some processes outright, explaining why:

- Anything in `portManager.protectedPorts` or `portManager.protectedProcesses`.
- System processes: PID 0, PID 1, and PID 4 (the Windows System process).
- The VS Code extension host Port Manager runs in, and the VS Code process that started it.
- Operating-system critical processes, which no setting can switch off: on Windows `System`, `smss`, `csrss`, `wininit`, `winlogon`, `services`, `lsass` and `svchost`; on macOS `launchd`, `WindowServer`, `loginwindow` and `kernel_task`; on Linux `systemd`, `Xorg`, `Xwayland`, `gnome-shell`, `dbus-daemon` and the display managers.
- A process owned by another user always asks for confirmation (button **Stop Anyway**) with an explicit warning, even if `portManager.confirmBeforeKill` is off. This needs the owner to be known, so it does not apply on Windows.

Port Manager never elevates privileges on its own. If the OS refuses (`permission denied`), the message tells you what to run yourself: `sudo kill <pid>` on macOS/Linux, or restart VS Code as administrator / use an elevated terminal on Windows.

Right before stopping anything, Port Manager scans again and checks that the same PID still holds the port with the same command, so a recycled PID cannot hit an unrelated process, and it applies these rules a second time. On Windows `taskkill /T` also ends child processes, so ancestors of the extension host are refused, and if the parent chain cannot be read only the process itself is stopped.

## Remote, WSL and containers

The extension runs where your files are (`"extensionKind": ["workspace"]`), so in Remote - SSH, WSL and Dev Containers it shows and manages the **remote** machine's ports, and **Open in Browser** is forwarded to your computer. Details and reasoning: [docs/remote-and-wsl.md](docs/remote-and-wsl.md).

## Diagnostics

What Port Manager could not do is written to **Output > Port Manager**: a tool that failed and was replaced by the next one (for example `ss` by `lsof`), PowerShell falling back to `netstat` for five minutes, a failing `ps`, and refused stops. If the list looks wrong, look there first.

## Status

Early development. Known limitations:

- Windows support has only been tested against sample output, not on a real Windows machine. `scripts/spike-windows-ports.js` measures the PowerShell path on Windows.

## Development

```
npm install
npm test                          # unit tests (vitest)
npm run check-types && npm run lint
```

Press `F5` in VS Code to launch the Extension Development Host, then open the Port Manager icon in the activity bar.

### Project layout

```
src/
  extension.ts                  entry point: wires everything together
  shared/                       code with no knowledge of ports (running programs)
  features/ports/
    port-types.ts               the shared contract (PortInfo, PlatformAdapter, KillResult)
    service/                    polling, caching, dedupe and error state
    platform/                   everything that talks to the OS
      linux/ darwin/ windows/   one adapter per OS
      parsers/                  pure parsers for each tool's output
    kill/                       stopping processes and the rules for when not to
    settings/                   portManager.* settings
    actions/                    kill, copy, open-in-browser, kill-by-port
    view/                       tree view, status bar, and the text they show
  test/                         mirrors src/ (see Tests below)
  integration/                  checks against the real OS
```

Only `extension.ts` and the files named `register-*`, `vscode-*` and `ports-tree-provider.ts` import `vscode`; everything else is plain TypeScript and is tested without VS Code.

### Tests

`npm test` runs every test with [vitest](https://vitest.dev) in plain Node. It needs no VS Code and none of the tools the extension calls (`ss`, `lsof`, `netstat`, `ps`, PowerShell, `tasklist`): the parsers and adapters are tested against saved output in `src/test/fixtures/`, and the adapters' commands are replaced by fakes. The Linux fixtures are real captures; the macOS and Windows ones are hand-built until someone captures them on those systems. See [src/test/fixtures/README.md](src/test/fixtures/README.md) for what is real and how to replace the hand-built files with `scripts/capture-fixtures.js`.

**Where tests go.** `src/test/` mirrors the source: the test for `src/features/ports/kill/unix-kill.ts` is `src/test/ports/kill/unix-kill.test.ts`, and for `src/shared/run-command.ts` it is `src/test/shared/run-command.test.ts`. One test file per source module. Saved tool output lives in `src/test/fixtures/`, small shared helpers in `src/test/helpers/`, and checks that need the real operating system in `src/integration/`.

A few tests start and stop real child processes to check the kill logic (signals on macOS/Linux, `taskkill` on Windows); they only touch processes they create themselves.

### Integration check and CI

```
npm run test:integration
```

Starts a throwaway server on a free loopback port, then uses this machine's real tools (`ss`/`lsof`/`netstat`/`ps` on Linux, `lsof`/`ps` on macOS, PowerShell/`netstat`/`tasklist` on Windows) to list ports, find it, kill it, and confirm it is gone. It is separate from `npm test` because it needs those tools.

GitHub Actions (`.github/workflows/ci.yml`) runs lint, type-check, build, `npm test` and the integration check on `ubuntu-latest`, `macos-latest` and `windows-latest` for every pull request and every push to `main`. A push to `main` that passes also builds `port-manager.vsix` and uploads it as the `port-manager-vsix` artifact.

Before publishing to the Marketplace, `package.json` still needs a `publisher`, a `repository` URL and a license file; the CI build works without them and produces a package you can sideload.
