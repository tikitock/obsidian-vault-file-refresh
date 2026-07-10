# Vault File Refresh

Automatically picks up files added to your Obsidian vault from outside the app — no manual restart required.

If you use Obsidian installed as a **Flatpak**, store your vault on a **network drive**, sync files via **scripts or AI tools**, or write to the vault from **external applications**, you have likely noticed that new files and folders do not appear in the file explorer until you restart Obsidian — or that a file already open in a tab (a Kanban board, a note being updated by an external script) shows stale content until you manually close and reopen it. This plugin fixes both.

## What It Does

Vault File Refresh runs a lightweight background poller that recursively scans your entire vault every 8 seconds.

- Files that exist on disk but aren't yet known to Obsidian get reconciled — immediately available in the file explorer, search, graph view, and Dataview queries.
- Files Obsidian already knows about, but whose content changed on disk since the last poll, get silently reconciled too — so an open Kanban board or note picks up the change through Obsidian's own normal update pipeline, without a forced tab reopen and without any visible flash/blink across the interface.

## Why This Happens

Obsidian uses filesystem watchers (via chokidar) to detect external changes. In certain environments, those watchers do not receive events reliably:

- **Flatpak installs** access the filesystem through the XDG Desktop Portal, which can block or delay inotify events from reaching the app
- **Network or FUSE-mounted drives** may not propagate filesystem events
- **Some Linux configurations** restrict inotify watch limits, causing events to be silently dropped

The community Auto Refresh plugin addresses a related issue but requires explicitly listing each folder to watch and does not operate recursively.

## Features

- Fully recursive — covers the entire vault including all nested subfolders
- Automatically tracks new folders as they are created
- Picks up content changes to files already open in a tab (Kanban boards, notes) without a manual close/reopen — no interface-wide flash or blink, only the specific file that changed is touched
- No configuration required — works out of the box
- Removes stale paths from tracking when files are deleted
- Command palette action ("Refresh vault now") to trigger and confirm a scan on demand, with a Notice showing what was reconciled
- Failed reconciliation attempts are retried on the next poll instead of being silently dropped
- Logs reconciled files (and any failures) to the developer console for transparency
- Minimal performance footprint — async polling with no blocking operations

## Installation

### From the Community Plugin Browser (recommended)
1. Open Obsidian Settings > Community Plugins
2. Search for **Vault File Refresh**
3. Click Install, then Enable

### Manual Installation
1. Download `manifest.json` and `main.js` from the latest release
2. Create a folder at `<your-vault>/.obsidian/plugins/vault-file-refresh/`
3. Place both files in that folder
4. Open Obsidian Settings > Community Plugins and enable the plugin

## Configuration

No configuration is required. The plugin works immediately on enable.

To adjust the polling interval, open `main.js` and change the `DEFAULT_INTERVAL` value at the top of the file (in milliseconds). Reload the plugin after saving.

## Compatibility

- Desktop only (not applicable to mobile)
- Tested on Obsidian 1.x
- Linux (Flatpak and native), macOS, and Windows compatible

## Debugging

Open the developer console (`Ctrl+Shift+I` or `Cmd+Option+I`) and filter for `VaultFileRefresh`. The plugin logs each reconciliation event with the affected file paths. Errors are reported under `VaultFileRefresh error` or `VaultFileRefresh: failed to reconcile`.

If a file still isn't showing up, run **Refresh vault now** from the command palette (`Ctrl+P`) — it scans immediately and shows a Notice with the number of files reconciled or failed, instead of waiting up to 8 seconds and checking the console.

## Known Limitations

- New files appear within 8 seconds of being written to disk rather than instantly
- Uses `vault.adapter.reconcileFile()`, an internal Obsidian API not formally documented in the public plugin API. Works reliably across current Obsidian versions but may require an update if Obsidian internals change

## Use Cases

- Obsidian installed as a Flatpak on Linux
- Writing notes or documents to your vault from external scripts or automation tools
- A Kanban board (or any note) updated by an external process while a tab has it open
- Using AI tools such as Claude Code with the Obsidian Local REST API plugin
- Syncing vault content from another machine or service that writes files directly
- Storing your vault on a NAS or network-mounted drive

## Support

Straight from the solar-powered TikiBarge, tools that don't exist that should make me nuts 🐒!
If you feel the same, shoot me a message and keep the Kittehs in kibble:
[Support me on Ko-fi](https://ko-fi.com/labtopia).

## Contributing

Issues and pull requests welcome. Please open an issue before submitting a PR for significant changes.

## License

MIT

---

☕ [Support this project on Ko-fi](https://ko-fi.com/labtopia)
