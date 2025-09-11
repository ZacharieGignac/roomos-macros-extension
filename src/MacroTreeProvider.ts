import * as vscode from 'vscode';
import { MacroManager } from './MacroManager';

export class MacroTreeProvider implements vscode.TreeDataProvider<MacroItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MacroItem | undefined | void> = new vscode.EventEmitter<MacroItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<MacroItem | undefined | void> = this._onDidChangeTreeData.event;

    private macros: MacroItem[] = [];
    private dirtySet: Set<string> = new Set();

    constructor(private manager: MacroManager) {
        this.fetchMacros();
    }

    public setManager(manager: MacroManager) {
        this.manager = manager;
        this.fetchMacros();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MacroItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MacroItem): Thenable<MacroItem[]> {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.macros);
    }

    public async fetchMacros() {
        try {
            const list = await this.manager.list();
            this.macros = list.map((m: any) => {
                const isDirty = this.dirtySet.has(m.Name);
                return new MacroItem(m.Name, String(m.id || ''), m.Active === 'True', isDirty, m.Content ?? '');
            });
            this.refresh();
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to fetch macros: ' + (err.message || String(err)));
        }
    }

    public setDirtySet(dirty: Set<string>) {
        this.dirtySet = dirty;
        // Update existing items' descriptions to reflect new dirty state
        for (const item of this.macros) {
            item.description = this.dirtySet.has(item.label) ? 'unsaved' : undefined;
        }
        this.refresh();
    }
}

class MacroItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly isActive: boolean,
        public readonly isDirty: boolean,
        public readonly content: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
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
