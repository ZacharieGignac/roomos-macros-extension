import * as vscode from 'vscode';

/**
 * Service to show "What's New" page after extension updates.
 * Displays the page only once per version.
 */
export class WhatsNewService {
    private static readonly LAST_VERSION_KEY = 'roomos-macros.lastShownVersion';

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly currentVersion: string
    ) { }

    /**
     * Check if we should show the What's New page and display it if needed.
     */
    public async checkAndShow(): Promise<void> {
        const lastVersion = this.context.globalState.get<string>(WhatsNewService.LAST_VERSION_KEY);

        // Show if this is a new version or first install
        if (lastVersion !== this.currentVersion) {
            await this.showWhatsNew();
            await this.context.globalState.update(WhatsNewService.LAST_VERSION_KEY, this.currentVersion);
        }
    }

    /**
     * Manually show the What's New page (for command invocation).
     */
    public async showWhatsNew(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'roomosWhatsNew',
            `What's New in RoomOS Macros v${this.currentVersion}`,
            vscode.ViewColumn.One,
            {
                enableScripts: false,
                retainContextWhenHidden: false
            }
        );

        panel.webview.html = this.getWebviewContent();
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>What's New</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 30px;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.6;
    }
    h1 {
      color: var(--vscode-textLink-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 12px;
      margin-bottom: 24px;
      font-size: 1.8em;
      font-weight: 600;
    }
    h2 {
      color: var(--vscode-foreground);
      margin-top: 32px;
      margin-bottom: 12px;
      font-size: 1.3em;
      font-weight: 600;
    }
    .version-badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 10px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .feature-section {
      margin: 20px 0;
      padding-left: 16px;
      border-left: 3px solid var(--vscode-textLink-foreground);
    }
    .feature-section h2 {
      margin-top: 0;
      font-size: 1.1em;
    }
    .feature-section p {
      margin: 8px 0;
    }
    .feature-list {
      margin: 12px 0;
      padding-left: 24px;
    }
    .feature-list li {
      margin: 6px 0;
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }
    .note {
      margin-top: 32px;
      padding: 16px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      font-size: 0.95em;
    }
  </style>
</head>
<body>
  <h1>What's New in RoomOS Macros Extension</h1>
  <span class="version-badge">v${this.currentVersion}</span>
  <div class="feature-section">
    <h2>Enhanced xAPI IntelliSense</h2>
    <p>Major improvements to code completion and development experience:</p>
    <ul class="feature-list">
      <li><strong>Smart Method Completions:</strong> Automatic <code>.get()</code>, <code>.on()</code>, and <code>.set()</code> suggestions on leaf nodes</li>
      <li><strong>Array Notation Support:</strong> Full IntelliSense for paths like <code>xapi.Status.Call[1].Status</code></li>
      <li><strong>Flexible Commands:</strong> Insert Stub and Show Help work with cursor anywhere in xAPI path</li>
      <li><strong>Better Stub Insertion:</strong> Code inserted on new line with preserved indentation</li>
    </ul>
  </div>

  <div class="feature-section">
    <h2>Improved Workflow</h2>
    <ul class="feature-list">
      <li><strong>Auto-Import:</strong> New macros automatically include <code>import xapi from 'xapi';</code></li>
      <li><strong>Reworked Context Menus:</strong> Easy access to Create and Restart commands with new "Actions" menu item</li>
      <li><strong>Tree View Improvements:</strong> Commands accessible from both context menus and title bar</li>
    </ul>
  </div>

  <div class="feature-section">
    <h2>WebSocket Secure (WSS) Only</h2>
    <p>SSH connection support has been removed. All codec connections now use <strong>WebSocket Secure (WSS)</strong> exclusively for improved reliability and security.</p>
    <ul class="feature-list">
      <li>Simplified profile setup with no connection method selection</li>
      <li>Existing SSH profiles automatically converted to WSS</li>
      <li>More reliable connection handling</li>
    </ul>
  </div>

  <div class="feature-section">
    <h2>Modern Settings Page Redesign</h2>
    <p>The Settings page has been completely redesigned with a clean, modern interface.</p>
  </div>





  <div class="note">
    <strong>Note:</strong> If you have existing profiles, they will continue to work seamlessly. SSH profiles are automatically converted to WSS.
  </div>
</body>
</html>`;
    }
}
