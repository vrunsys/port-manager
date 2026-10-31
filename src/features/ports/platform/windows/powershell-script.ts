/**
 * Lists listening TCP ports as JSON. JSON keeps the output independent of the Windows
 * display language, and one Get-Process call is cheaper than one per port.
 * Only single quotes are used so the script survives any command-line quoting.
 */
export const LIST_PORTS_SCRIPT = [
	"$ErrorActionPreference = 'Stop'",
	// Without "$false" PowerShell 5.1 writes a BOM in front of the JSON.
	'[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false',
	'$processes = @{}',
	'Get-Process | ForEach-Object { $processes[[int]$_.Id] = $_ }',
	// SilentlyContinue: "no listening ports" is an error in Get-NetTCPConnection, not an empty result.
	'$rows = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {',
	'  $process = $processes[[int]$_.OwningProcess]',
	'  [pscustomobject]@{',
	'    Port = $_.LocalPort; Address = $_.LocalAddress; Pid = $_.OwningProcess',
	'    ProcessName = $process.ProcessName; Path = $process.Path',
	'  }',
	'})',
	'ConvertTo-Json -InputObject $rows -Compress',
].join('\n');

/** -EncodedCommand takes base64 UTF-16LE, which avoids all escaping problems. */
export const POWERSHELL_LIST_ARGS: readonly string[] = [
	'-NoProfile',
	'-NonInteractive',
	'-EncodedCommand',
	Buffer.from(LIST_PORTS_SCRIPT, 'utf16le').toString('base64'),
];
