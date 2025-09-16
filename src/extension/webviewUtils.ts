import * as vscode from 'vscode';

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getMediaUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathSegments: string[]): vscode.Uri {
  const onDisk = vscode.Uri.joinPath(extensionUri, ...pathSegments);
  return webview.asWebviewUri(onDisk);
}


