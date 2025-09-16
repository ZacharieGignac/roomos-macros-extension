import * as vscode from 'vscode';
import { MacroTreeProvider } from '../MacroTreeProvider';

export class DirtyMacroTracker {
  private readonly dirty = new Set<string>();
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly treeProvider: MacroTreeProvider) {}

  attach(context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.scheme === 'codecfs') this.updateDirtyState();
      }),
      vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.uri.scheme === 'codecfs') this.updateDirtyState();
      }),
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.uri.scheme === 'codecfs') this.updateDirtyState();
      }),
      vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.uri.scheme === 'codecfs') this.updateDirtyState();
      })
    );
    this.updateDirtyState();
    context.subscriptions.push(...this.disposables);
  }

  updateDirtyState() {
    this.dirty.clear();
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme === 'codecfs' && doc.isDirty) {
        const name = doc.uri.path.replace(/^\//, '').replace(/\.js$/, '');
        this.dirty.add(name);
      }
    }
    this.treeProvider.setDirtySet(this.dirty);
  }

  dispose() {
    for (const d of this.disposables) {
      try { d.dispose(); } catch {}
    }
    this.disposables = [];
  }
}


