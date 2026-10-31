# Test fixtures

Saved output of the tools the adapters parse. The parser tests read these files, so they run on any machine without `ss`, `lsof`, `netstat`, PowerShell or `tasklist`.

| Folder | Origin |
|---|---|
| `linux/` | **Real.** Captured on Ubuntu with `scripts/capture-fixtures.js` while a helper process held IPv4, IPv6, wildcard and dual-stack listeners, and two processes shared one port. Contains genuine hidden-process rows (ports owned by other users). User name and home directory are replaced by `dev`; `ps.txt` command lines are cut to 110 characters. |
| `macos/` | **Hand-built** in macOS's `lsof` format (hex `DEVICE`, `\x20` escapes). Not captured on a Mac. |
| `windows/` | **Hand-built.** Not captured on Windows. The `netstat-*.txt` files imitate localized output (English, German, French, Russian, Italian). Italian is deliberate: its "listening" label has two words. |

## Replacing the hand-built files with real captures

On a Mac or a Windows machine, with a few servers listening (include IPv6 and wildcard binds):

```
node scripts/capture-fixtures.js src/test/fixtures/macos     # on macOS
node scripts/capture-fixtures.js src/test/fixtures/windows   # on Windows
```

The script writes the same file names used here (Windows: `powershell.json`, `netstat.txt`, `tasklist.csv`) and replaces your user name with `dev`. Review the output for anything personal before committing, then update the expectations in the tests (port numbers and PIDs will differ). For localized Windows output, run `netstat -ano` on a machine set to that language and save it as `netstat-<language>.txt`.

## Updating the Linux fixtures

The tests assert exact rows from `linux/` (ports, PIDs, names), so a new capture means updating those expectations too. Prefer adding a new capture alongside the old one.
