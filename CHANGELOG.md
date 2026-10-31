# Change Log

All notable changes to the "port-manager" extension will be documented in this file.

## [Unreleased]

- Sidebar view listing listening ports (port, protocol, process, PID, user) with tooltips, refresh button, and empty/error states.
- Port listing for Linux (`ss`, `lsof`, `netstat`), macOS (`lsof`) and Windows (PowerShell, `netstat`/`tasklist`).
- Polling service that skips overlapping scans, merges IPv4/IPv6 duplicates and only notifies on real changes.
- Cross-platform process kill logic (not yet exposed in the UI).
