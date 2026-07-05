'use strict';
const obsidian = require('obsidian');

const DEFAULT_INTERVAL = 8000; // ms

class VaultFileRefresh extends obsidian.Plugin {

    async onload() {
        this.knownPaths = new Set(
            this.app.vault.getFiles().map(f => f.path)
        );

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

            if (manual) {
                const parts = [];
                parts.push(`Scanned ${diskPaths.size} file(s).`);
                parts.push(reconciled.length > 0 ? `Reconciled ${reconciled.length}.` : 'Nothing new to reconcile.');
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
        containerEl.createEl('p', { text: `Polling every ${DEFAULT_INTERVAL / 1000} seconds for new files added outside Obsidian.` });
        containerEl.createEl('p', { text: 'Run "Refresh vault now" from the command palette to trigger a scan immediately and see the result.' });
    }
}

module.exports = VaultFileRefresh;
