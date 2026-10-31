# Remote, WSL and container behaviour

**Decision:** Port Manager declares `"extensionKind": ["workspace"]` in `package.json`.

## Why

Port Manager lists and stops processes on the machine its code runs on. VS Code can run an extension in two places:

| Extension host | Runs on | Port Manager would show |
|---|---|---|
| `workspace` | Next to the files: the remote machine, WSL distro or container when connected to one, otherwise your computer | The ports of the environment you are developing in |
| `ui` | Always your local computer | The ports of your laptop, even while you work on a remote server |

When you work over SSH, in WSL or in a Dev Container, the dev servers and databases you want to see (and sometimes stop) live in that environment. A `ui` extension would show the wrong machine, and killing a port there would never reach the process you meant. So the extension runs in the workspace host.

Without a remote connection the workspace host is your computer, so local use is unchanged.

## What this means in practice

- **Remote - SSH / Dev Containers / Codespaces:** the view, status bar count, and kill all act on the remote machine or container. The extension must be installed there; VS Code offers to do that automatically.
- **WSL:** inside a WSL window it runs in the Linux distro and lists the distro's ports using `ss` (falling back to `lsof` and `netstat`). Windows processes are not shown. To manage Windows-side ports, open a normal (non-WSL) window.
- **Open in Browser:** the link goes through `vscode.env.asExternalUri`, so VS Code forwards the remote port to your computer and `http://localhost:<port>` opens the right thing.
- **Permissions:** the extension acts with the rights of the user the remote server runs as. It never elevates. See [Safety](../README.md#safety).
- **Not supported:** web-only hosts (vscode.dev, github.dev) cannot run local programs, so the extension does not run there.
- **Other-user warning:** it compares each process's owner with the user running the extension host. On Windows the owner is not reported, so that warning does not appear there.

## Tests

`src/test/manifest.test.ts` fails if `extensionKind` is changed, so a change of this decision has to be deliberate and update this document.
