"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacroTreeProvider = void 0;
const vscode = require("vscode");
class MacroTreeProvider {
    constructor(manager) {
        this.manager = manager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.macros = [];
        this.dirtySet = new Set();
        this.fetchMacros();
    }
    setManager(manager) {
        this.manager = manager;
        this.fetchMacros();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.macros);
    }
    async fetchMacros() {
        try {
            const list = await this.manager.list();
            this.macros = list.map((m) => {
                const isDirty = this.dirtySet.has(m.Name);
                return new MacroItem(m.Name, String(m.id || ''), m.Active === 'True', isDirty, m.Content ?? '');
            });
            this.refresh();
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to fetch macros: ' + (err.message || String(err)));
        }
    }
    setDirtySet(dirty) {
        this.dirtySet = dirty;
        // Update existing items' descriptions to reflect new dirty state
        for (const item of this.macros) {
            item.description = this.dirtySet.has(item.label) ? 'unsaved' : undefined;
        }
        this.refresh();
    }
}
exports.MacroTreeProvider = MacroTreeProvider;
class MacroItem extends vscode.TreeItem {
    constructor(label, id, isActive, isDirty, content) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.id = id;
        this.isActive = isActive;
        this.isDirty = isDirty;
        this.content = content;
        this.tooltip = content.substring(0, 50) + '...';
        this.command = {
            command: 'ciscoCodec.openMacro',
            title: 'Open Macro',
            arguments: [this.label]
        };
        this.contextValue = isActive ? 'macro:active' : 'macro:inactive';
        this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(isActive ? 'testing.iconPassed' : 'testing.iconFailed'));
        this.description = isDirty ? 'unsaved' : undefined;
    }
}
//# sourceMappingURL=MacroTreeProvider.js.map