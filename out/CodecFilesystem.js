"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodecFileSystem = void 0;
const vscode = require("vscode");
class CodecFileSystem {
    constructor(manager) {
        this.manager = manager;
        this.onDidChangeFile = new vscode.EventEmitter().event;
    }
    setManager(manager) {
        this.manager = manager;
    }
    watch() {
        return new vscode.Disposable(() => { });
    }
    async stat(uri) {
        return { type: vscode.FileType.File, ctime: Date.now(), mtime: Date.now(), size: 0 };
    }
    async readDirectory() {
        try {
            const list = await this.manager.list();
            return list.map((m) => [m.Name + '.js', vscode.FileType.File]);
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to list macros: ' + (err?.message || String(err)));
            return [];
        }
    }
    async readFile(uri) {
        try {
            const name = uri.path.replace(/^\//, '').replace(/\.js$/, '');
            const content = await this.manager.get(name);
            return Buffer.from(content, 'utf-8');
        }
        catch (err) {
            const msg = err?.message || String(err);
            vscode.window.showErrorMessage('Failed to open macro: ' + msg);
            throw err;
        }
    }
    async writeFile(uri, content) {
        const name = uri.path.replace(/^\//, '').replace(/\.js$/, '');
        await this.manager.save(name, Buffer.from(content).toString('utf-8'));
        vscode.window.showInformationMessage(`Saved macro ${name}`);
        const auto = vscode.workspace.getConfiguration('codec').get('autoRestartOnSave', false);
        if (auto) {
            try {
                await this.manager.restartFramework();
                vscode.window.showInformationMessage('Macro framework restarted');
            }
            catch (err) {
                vscode.window.showErrorMessage('Failed to restart macro framework: ' + (err?.message || String(err)));
            }
        }
    }
    createDirectory() {
        throw new Error('Directories not supported');
    }
    delete(uri) {
        const name = uri.path.replace(/^\//, '').replace(/\.js$/, '');
        return this.manager.delete(name);
    }
    rename() {
        throw new Error('Rename not supported');
    }
}
exports.CodecFileSystem = CodecFileSystem;
//# sourceMappingURL=CodecFilesystem.js.map