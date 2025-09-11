import * as vscode from 'vscode';
import { MacroManager } from './MacroManager';

export class CodecFileSystem implements vscode.FileSystemProvider {
  constructor(private manager: MacroManager) {}

  public setManager(manager: MacroManager) {
    this.manager = manager;
  }

  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >().event;

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    return { type: vscode.FileType.File, ctime: Date.now(), mtime: Date.now(), size: 0 };
  }

  async readDirectory(): Promise<[string, vscode.FileType][]> {
    try {
      const list = await this.manager.list();
      return list.map((m: any) => [m.Name + '.js', vscode.FileType.File]);
    } catch (err: any) {
      vscode.window.showErrorMessage('Failed to list macros: ' + (err?.message || String(err)));
      return [];
    }
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    try {
      const name = uri.path.replace(/^\//, '').replace(/\.js$/, '');
      const content = await this.manager.get(name);
      return Buffer.from(content, 'utf-8');
    } catch (err: any) {
      const msg = err?.message || String(err);
      vscode.window.showErrorMessage('Failed to open macro: ' + msg);
      throw err;
    }
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const name = uri.path.replace(/^\//, '').replace(/\.js$/, '');
    await this.manager.save(name, Buffer.from(content).toString('utf-8'));
    vscode.window.showInformationMessage(`Saved macro ${name}`);
    const auto = vscode.workspace.getConfiguration('codec').get<boolean>('autoRestartOnSave', false);
    if (auto) {
      try {
        await this.manager.restartFramework();
        vscode.window.showInformationMessage('Macro framework restarted');
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to restart macro framework: ' + (err?.message || String(err)));
      }
    }
  }

  createDirectory(): void {
    throw new Error('Directories not supported');
  }

  delete(uri: vscode.Uri): void | Thenable<void> {
    const name = uri.path.replace(/^\//, '').replace(/\.js$/, '');
    return this.manager.delete(name);
  }

  rename(): void {
    throw new Error('Rename not supported');
  }
}
