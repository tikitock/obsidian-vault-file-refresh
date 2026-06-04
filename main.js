'use strict';
const obsidian = require('obsidian');

const DEFAULT_INTERVAL = 8000; // ms

class VaultFileRefresh extends obsidian.Plugin {

    async onload() {
        this.knownPaths = new Set(
            this.app.vault.getFiles().map(f => f.path)
        );

        this.addSettingTab(new RefreshSettingTab(this.app, this));

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

    async refresh() {
        try {
            const diskPaths = await this.listAll('');
            const newPaths = [];

            for (const p of diskPaths) {
                if (!this.knownPaths.has(p)) {
                    newPaths.push(p);
                    this.knownPaths.add(p);
                }
            }

            for (const p of [...this.knownPaths]) {
                if (!diskPaths.has(p)) {
                    this.knownPaths.delete(p);
                }
            }

            for (const p of newPaths) {
                try {
                    await this.app.vault.adapter.reconcileFile(p, p, false);
                } catch (e) {
                    // file may have already been picked up
                }
            }

            if (newPaths.length > 0) {
                console.log('VaultFileRefresh: reconciled', newPaths.length, 'new file(s):', newPaths);
            }
        } catch (e) {
            console.error('VaultFileRefresh error:', e);
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
    }
}

module.exports = VaultFileRefresh;
