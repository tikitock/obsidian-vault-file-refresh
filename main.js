'use strict';
const obsidian = require('obsidian');

const DEFAULT_INTERVAL = 8000; // ms

class VaultFileRefresh extends obsidian.Plugin {

    async onload() {
        this.knownPaths = new Set(
            this.app.vault.getFiles().map(f => f.path)
        );
        this.knownMtimes = new Map();
        await this.primeMtimes();

        this.addSettingTab(new RefreshSettingTab(this.app, this));

        this.addCommand({
            id: 'refresh-vault-now',
            name: 'Refresh vault now',
            callback: () => this.refresh(true)
        });

        this.startPolling();

        console.log('VaultFileRefresh: loaded, polling every', DEFAULT_INTERVAL, 'ms');
    }

    startPolling() {
        this.registerInterval(
            window.setInterval(() => {
                this.refresh().catch(e => {
                    console.error('VaultFileRefresh: poll error, will retry next interval', e);
                });
            }, DEFAULT_INTERVAL)
        );
    }

    async refresh(manual = false) {
        if (this.refreshing) {
            if (manual) new obsidian.Notice('VaultFileRefresh: a scan is already in progress.');
            return;
        }
        this.refreshing = true;

        try {
            const diskPaths = await this.listAll('');
            const candidatePaths = [];

            for (const p of diskPaths) {
                if (!this.knownPaths.has(p)) {
                    candidatePaths.push(p);
                }
            }

            for (const p of [...this.knownPaths]) {
                if (!diskPaths.has(p)) {
                    this.knownPaths.delete(p);
                    this.knownMtimes.delete(p);
                }
            }

            const reconciled = [];
            const failed = [];

            for (const p of candidatePaths) {
                // Mark as known regardless of outcome. A path that keeps
                // failing to reconcile (permission issue, transient FS
                // error, etc.) must not be retried every single poll —
                // that leads to an unbounded retry storm that can peg the
                // renderer. Failures are still logged for visibility.
                this.knownPaths.add(p);

                try {
                    await this.app.vault.adapter.reconcileFile(p, p, false);
                    reconciled.push(p);

                    const file = this.app.vault.getAbstractFileByPath(p);
                    if (file instanceof obsidian.TFile && file.extension === 'md') {
                        // Force an immediate content read so metadata/search
                        // resolve now rather than lazily on next file open.
                        await this.app.vault.cachedRead(file);
                        await this.updateMtime(p);
                    }
                } catch (e) {
                    failed.push(p);
                    console.error('VaultFileRefresh: failed to reconcile', p, e);
                }
            }

            if (reconciled.length > 0) {
                console.log('VaultFileRefresh: reconciled', reconciled.length, 'new file(s):', reconciled);
            }
            if (failed.length > 0) {
                console.warn('VaultFileRefresh:', failed.length, 'file(s) failed to reconcile (will not retry):', failed);
            }

            const changed = await this.reconcileModifiedFiles();
            if (changed.length > 0) {
                console.log('VaultFileRefresh: picked up', changed.length, 'externally modified file(s):', changed);
            }

            if (manual) {
                const parts = [];
                parts.push(`Scanned ${diskPaths.size} file(s).`);
                parts.push(reconciled.length > 0 ? `Reconciled ${reconciled.length}.` : 'Nothing new to reconcile.');
                if (changed.length > 0) parts.push(`Picked up ${changed.length} modified file(s).`);
                if (failed.length > 0) parts.push(`${failed.length} failed (see console).`);
                new obsidian.Notice('VaultFileRefresh: ' + parts.join(' '));
            }
        } catch (e) {
            console.error('VaultFileRefresh error:', e);
            if (manual) {
                new obsidian.Notice('VaultFileRefresh: error during refresh, see console.');
            }
        } finally {
            this.refreshing = false;
        }
    }

    async listAll(dir) {
        const result = new Set();
        try {
            const listing = await this.app.vault.adapter.list(dir);
            for (const f of listing.files) result.add(f);
            for (const sub of listing.folders) {
                const subFiles = await this.listAll(sub);
                for (const f of subFiles) result.add(f);
            }
        } catch (e) {
            // folder may not be accessible
        }
        return result;
    }

    async primeMtimes() {
        for (const f of this.app.vault.getFiles()) {
            if (f.extension === 'md') {
                await this.updateMtime(f.path);
            }
        }
    }

    async updateMtime(path) {
        try {
            const stat = await this.app.vault.adapter.stat(path);
            if (stat) this.knownMtimes.set(path, stat.mtime);
        } catch (e) {
            // stat can fail transiently; next poll will retry
        }
    }

    // Obsidian's own vault watcher (chokidar) is what's unreliable here in the
    // first place -- that's the whole reason this plugin exists. So even an
    // already-known file (a Kanban board, a plain note) can sit stale after
    // its content changes on disk, with nothing telling Obsidian to re-read
    // it. reconcileFile is the same primitive already used above for
    // brand-new files, which lets Obsidian's own normal update pipeline
    // handle the redraw exactly as it would for any ordinary same-app edit --
    // no forced tab reopen, no visible flash/blink. A previous community
    // refresh plugin caused a blink across the whole interface; this only
    // ever touches the exact path that actually changed on disk.
    async reconcileModifiedFiles() {
        const changed = [];
        for (const path of [...this.knownPaths]) {
            if (!path.endsWith('.md')) continue;

            const previousMtime = this.knownMtimes.get(path);
            const stat = await this.app.vault.adapter.stat(path).catch(() => null);
            if (!stat) continue;

            if (previousMtime === undefined || stat.mtime === previousMtime) {
                this.knownMtimes.set(path, stat.mtime);
                continue;
            }

            try {
                await this.app.vault.adapter.reconcileFile(path, path, false);
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof obsidian.TFile) {
                    await this.app.vault.cachedRead(file);
                }
                changed.push(path);
            } catch (e) {
                console.error('VaultFileRefresh: failed to reconcile modified file', path, e);
            }
            this.knownMtimes.set(path, stat.mtime);
        }
        return changed;
    }

    onunload() {
        console.log('VaultFileRefresh: unloaded');
    }
}

class RefreshSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Vault File Refresh' });
        containerEl.createEl('p', { text: `Polling every ${DEFAULT_INTERVAL / 1000} seconds for new files added outside Obsidian, and for existing files modified outside Obsidian (e.g. Kanban boards or notes edited by external scripts).` });
        containerEl.createEl('p', { text: 'Run "Refresh vault now" from the command palette to trigger a scan immediately and see the result.' });

        renderSupportFooter(containerEl);
    }
}

function renderSupportFooter(containerEl) {
    containerEl.createEl('h3', { text: 'Support' });
    containerEl.createEl('p', {
        text: "Straight from the solar-powered TikiBarge, tools that don't exist that should make me nuts 🐒! If you feel the same, shoot me a message and keep the Kittehs in kibble:"
    });

    const kofiLink = containerEl.createEl('a');
    kofiLink.href = 'https://ko-fi.com/labtopia';
    kofiLink.target = '_blank';
    kofiLink.rel = 'noopener';

    const kofiImg = kofiLink.createEl('img');
    kofiImg.src = 'https://storage.ko-fi.com/cdn/kofi6.png?v=6';
    kofiImg.alt = 'Buy Me a Coffee at ko-fi.com';
    kofiImg.height = 36;
    kofiImg.style.height = '36px';
    kofiImg.style.border = '0px';
}

module.exports = VaultFileRefresh;
