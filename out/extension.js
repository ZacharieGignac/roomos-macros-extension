"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const MacroManager_1 = require("./MacroManager");
const CodecFilesystem_1 = require("./CodecFilesystem");
const MacroTreeProvider_1 = require("./MacroTreeProvider");
const ProfileStore_1 = require("./ProfileStore");
const ProfilesWebview_1 = require("./ProfilesWebview");
const XapiLanguage_1 = require("./XapiLanguage");
const SchemaService_1 = require("./SchemaService");
async function activate(context) {
    const profiles = new ProfileStore_1.ProfileStore(context);
    const config = vscode.workspace.getConfiguration('codec');
    // Hoisted state so commands work before first connection
    let currentManager = null;
    let currentProfileId = null;
    let provider = null;
    let treeProvider = null;
    let unbindManagerState = null;
    let xapiHelpPanel = null;
    let unbindMacroLogs = null;
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.name = 'RoomOS Macros';
    statusBar.command = 'ciscoCodec.manageProfiles';
    statusBar.text = '$(debug-disconnect) RoomOS: Disconnected';
    statusBar.tooltip = 'Manage codec profiles';
    statusBar.show();
    const macroOutput = vscode.window.createOutputChannel('RoomOS Macro Logs');
    context.subscriptions.push(macroOutput);
    function setConnectedContext(connected) {
        vscode.commands.executeCommand('setContext', 'codec.connected', connected);
    }
    function bindManagerState(manager, host) {
        if (unbindManagerState)
            unbindManagerState();
        const update = () => {
            const s = manager.getState();
            if (s === 'ready') {
                statusBar.text = '$(check) RoomOS: Connected';
                statusBar.tooltip = `Connected to ${host}`;
                setConnectedContext(true);
            }
            else if (s === 'connecting') {
                statusBar.text = '$(sync~spin) RoomOS: Connecting…';
                statusBar.tooltip = `Connecting to ${host}`;
                setConnectedContext(false);
            }
            else if (s === 'reconnecting') {
                statusBar.text = '$(sync~spin) RoomOS: Reconnecting…';
                statusBar.tooltip = `Reconnecting to ${host}`;
                setConnectedContext(false);
            }
            else if (s === 'disconnected') {
                statusBar.text = '$(debug-disconnect) RoomOS: Disconnected';
                statusBar.tooltip = 'Manage codec profiles';
                setConnectedContext(false);
            }
            else if (s === 'error') {
                statusBar.text = '$(error) RoomOS: Error';
                statusBar.tooltip = `Connection error for ${host}`;
                setConnectedContext(false);
            }
            else {
                statusBar.text = '$(gear) RoomOS';
                statusBar.tooltip = 'RoomOS Macros';
                setConnectedContext(false);
            }
        };
        update();
        const off = manager.onStateChange(() => update());
        unbindManagerState = () => {
            off();
            unbindManagerState = null;
        };
    }
    function bindMacroLogs(manager, host) {
        if (unbindMacroLogs)
            unbindMacroLogs();
        const formatLog = (val) => {
            try {
                if (val && typeof val === 'object' && (val.Message || val.Level || val.Macro)) {
                    const tsRaw = typeof val.Timestamp === 'string' ? val.Timestamp : undefined;
                    const time = tsRaw ? tsRaw.slice(11, 23) : new Date().toISOString().slice(11, 23);
                    const level = String(val.Level || '').toUpperCase();
                    const macro = String(val.Macro || '');
                    const message = String(val.Message || '').trim();
                    const badge = level.includes('ERR') ? '🔴' : level.includes('WARN') ? '🟡' : '🟢';
                    const macStr = macro ? `[${macro}]` : '';
                    const parts = macStr ? [time, badge, macStr] : [time, badge];
                    return `${parts.join(' ')} - ${message}`;
                }
            }
            catch { }
            return `${typeof val === 'string' ? val : JSON.stringify(val, null, 2)}`;
        };
        const off = manager.onMacroLog((value) => {
            const line = formatLog(value);
            macroOutput.appendLine(line);
        });
        unbindMacroLogs = () => {
            off();
            unbindMacroLogs = null;
        };
    }
    const getManagerOrWarn = () => {
        if (!currentManager) {
            vscode.window.showWarningMessage('No active codec connection. Add and activate a profile in Settings.');
            return null;
        }
        if (!currentManager.isConnected()) {
            vscode.window.showWarningMessage('Codec is offline. Wait for connection or switch profile.');
            return null;
        }
        return currentManager;
    };
    // Ensure Settings UI is available even if activation exits early
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.manageProfiles', async () => {
        const web = new ProfilesWebview_1.ProfilesWebview(context, profiles);
        await web.show();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.insertXapiStub', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'codecfs')
            return;
        const pos = editor.selection.active;
        const linePrefix = editor.document.getText(new vscode.Range(pos.line, 0, pos.line, Number.MAX_SAFE_INTEGER)).slice(0, pos.character);
        const ctx = (0, XapiLanguage_1.parseXapiContext)(linePrefix);
        if (!ctx?.found || !ctx?.category) {
            vscode.window.showInformationMessage('Place the cursor on an xapi path like xapi.Command.Audio.');
            return;
        }
        let basePath = ctx.category;
        const schema = new SchemaService_1.SchemaService(context);
        for (const seg of ctx.completedSegments) {
            const children = await schema.getChildrenMap(basePath);
            if (!children)
                break;
            const keys = Object.keys(children);
            const match = keys.find(k => k.toLowerCase() === String(seg).toLowerCase());
            basePath = match ? `${basePath}.${match}` : `${basePath}.${seg}`;
        }
        // Include current token if it uniquely matches
        if (ctx.currentPartial) {
            const children = await schema.getChildrenMap(basePath);
            if (children) {
                const keys = Object.keys(children);
                const exact = keys.find(k => k.toLowerCase() === String(ctx.currentPartial).toLowerCase());
                const matches = keys.filter(k => k.toLowerCase().startsWith(String(ctx.currentPartial).toLowerCase()));
                const chosen = exact || (matches.length === 1 ? matches[0] : undefined);
                if (chosen)
                    basePath = `${basePath}.${chosen}`;
            }
        }
        const node = await schema.getNodeSchema(basePath);
        if (!node) {
            vscode.window.showWarningMessage('No schema found for stub.');
            return;
        }
        const meta = node?.attributes || node;
        const type = node?.type || meta?.type || '';
        let snippet = '';
        if (type === 'Command') {
            // Build command params object stub
            const params = Array.isArray(meta?.params) ? meta.params : [];
            const fields = params.map((p) => `${p.name}: ${JSON.stringify(p.default ?? '')}`).join(', ');
            snippet = `xapi.Command.${basePath.split('.').slice(1).join('.')}({ ${fields} });`;
        }
        else if (type === 'Config') {
            snippet = `xapi.Config.${basePath.split('.').slice(1).join('.')} = $1;`;
        }
        else if (type === 'Status') {
            snippet = `const value = await xapi.Status.${basePath.split('.').slice(1).join('.')}.get();`;
        }
        else if (type === 'Event') {
            snippet = `xapi.Event.${basePath.split('.').slice(1).join('.')}.on((event) => {\n  // TODO: handle event\n});`;
        }
        else {
            snippet = `// xapi ${basePath}`;
        }
        // Replace the current xapi path token if present; otherwise insert at cursor
        const lineText = editor.document.lineAt(pos.line).text;
        const uptoCursor = lineText.slice(0, pos.character);
        const startIdx = uptoCursor.lastIndexOf('xapi.');
        if (startIdx >= 0) {
            const replaceRange = new vscode.Range(pos.line, startIdx, pos.line, pos.character);
            await editor.insertSnippet(new vscode.SnippetString(snippet), replaceRange);
        }
        else {
            await editor.insertSnippet(new vscode.SnippetString(snippet), editor.selection.start);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.showXapiHelp', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'codecfs')
            return;
        const pos = editor.selection.active;
        const linePrefix = editor.document.getText(new vscode.Range(pos.line, 0, pos.line, Number.MAX_SAFE_INTEGER)).slice(0, pos.character);
        // Reuse language parse to find context
        const ctx = (0, XapiLanguage_1.parseXapiContext)(linePrefix);
        if (!ctx?.found || !ctx?.category) {
            vscode.window.showInformationMessage('Place the cursor on an xapi path like xapi.Command.Audio.');
            return;
        }
        let basePath = ctx.category;
        const schema = new SchemaService_1.SchemaService(context);
        for (const seg of ctx.completedSegments) {
            const children = await schema.getChildrenMap(basePath);
            if (!children)
                break;
            const keys = Object.keys(children);
            const match = keys.find(k => k.toLowerCase() === String(seg).toLowerCase());
            basePath = match ? `${basePath}.${match}` : `${basePath}.${seg}`;
        }
        // Try to include the current token if it exactly matches a child, or uniquely matches as a prefix
        if (ctx.currentPartial) {
            const children = await schema.getChildrenMap(basePath);
            if (children) {
                const keys = Object.keys(children);
                const exact = keys.find(k => k.toLowerCase() === String(ctx.currentPartial).toLowerCase());
                if (exact) {
                    basePath = `${basePath}.${exact}`;
                }
                else {
                    const matches = keys.filter(k => k.toLowerCase().startsWith(String(ctx.currentPartial).toLowerCase()));
                    if (matches.length === 1) {
                        basePath = `${basePath}.${matches[0]}`;
                    }
                }
            }
        }
        const node = await schema.getNodeSchema(basePath);
        if (!node) {
            vscode.window.showInformationMessage('No schema information found for current symbol.');
            return;
        }
        const meta = node?.attributes || node;
        const title = basePath;
        const desc = meta?.description || meta?.help || '';
        const kind = node?.type || meta?.type || '';
        const access = meta?.access ? String(meta.access) : '';
        const roles = Array.isArray(meta?.role) ? meta.role : undefined;
        const params = Array.isArray(meta?.params) ? meta.params : undefined;
        // Render as a single webview panel (no extra document tabs)
        const htmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const rows = [];
        rows.push(`<div class="hdr"><span class="title">${htmlEscape(title)}</span>${kind ? `<span class="pill">${htmlEscape(kind)}</span>` : ''}</div>`);
        const metaBits = [];
        if (access)
            metaBits.push(`<span class="meta"><b>access</b>: ${htmlEscape(access)}</span>`);
        if (roles && roles.length)
            metaBits.push(`<span class="meta"><b>roles</b>: ${roles.map(htmlEscape).join(', ')}</span>`);
        if (metaBits.length)
            rows.push(`<div class="metaRow">${metaBits.join(' · ')}</div>`);
        if (desc)
            rows.push(`<div class="desc">${htmlEscape(desc)}</div>`);
        if (params && params.length) {
            rows.push('<h3>Parameters</h3>');
            rows.push('<table><thead><tr><th>Name</th><th class="r">Required</th><th>Default</th><th>Type</th><th>Values</th></tr></thead><tbody>');
            for (const p of params) {
                const name = p?.name ?? '';
                const required = p?.required ? 'yes' : 'no';
                const def = p?.default ?? '';
                const vs = p?.valuespace || {};
                let type = vs?.type || '';
                let values = '';
                if (Array.isArray(vs?.Values)) {
                    values = vs.Values.map(htmlEscape).join(', ');
                    type = type || 'Literal';
                }
                else {
                    const min = vs?.Min, max = vs?.Max, step = vs?.Step;
                    const bits = [min !== undefined ? `min ${htmlEscape(min)}` : '', max !== undefined ? `max ${htmlEscape(max)}` : '', step !== undefined ? `step ${htmlEscape(step)}` : ''].filter(Boolean).join(', ');
                    if (bits)
                        values = bits;
                }
                rows.push(`<tr><td>${htmlEscape(name)}</td><td class="r">${htmlEscape(required)}</td><td>${htmlEscape(def)}</td><td>${htmlEscape(type)}</td><td>${values}</td></tr>`);
            }
            rows.push('</tbody></table>');
        }
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; }
    .hdr { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .title { font-weight:600; font-size: 14px; }
    .pill { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 8px; padding: 2px 8px; font-size: 11px; }
    .metaRow { opacity: 0.85; margin-bottom: 8px; }
    .meta b { font-weight: 600; }
    .desc { white-space: pre-wrap; margin: 8px 0 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid var(--vscode-editorGroup-border); padding: 4px 6px; vertical-align: top; }
    th { background: var(--vscode-editor-background); text-align: left; }
    .r { text-align: right; }
  </style>
  <title>xAPI Help</title>
  </head>
  <body>
    ${rows.join('\n')}
  </body>
</html>`;
        if (xapiHelpPanel) {
            xapiHelpPanel.title = 'xAPI Help';
            xapiHelpPanel.webview.html = html;
            xapiHelpPanel.reveal(vscode.ViewColumn.Beside);
        }
        else {
            xapiHelpPanel = vscode.window.createWebviewPanel('xapiHelp', 'xAPI Help', vscode.ViewColumn.Beside, { enableScripts: false, retainContextWhenHidden: true });
            xapiHelpPanel.onDidDispose(() => { xapiHelpPanel = null; });
            xapiHelpPanel.webview.html = html;
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.addProfile', async () => {
        const added = await promptAddProfile(profiles);
        if (added) {
            vscode.window.showInformationMessage(`Added profile ${added.label}`);
            try {
                const listNow = await profiles.listProfiles();
                if (listNow.length === 1) {
                    await profiles.setActiveProfileId(added.id);
                    await vscode.commands.executeCommand('ciscoCodec.reloadForActiveProfile');
                }
            }
            catch (e) {
                vscode.window.showWarningMessage('Profile added, but failed to auto-connect: ' + (e?.message || String(e)));
            }
        }
    }));
    // Reset all stored data (profiles + secrets + legacy settings)
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.resetExtensionData', async () => {
        const confirm = await vscode.window.showWarningMessage('Remove all saved codec profiles and passwords from this machine?', { modal: true }, 'Reset');
        if (confirm !== 'Reset')
            return;
        try {
            const list = await profiles.listProfiles();
            for (const p of list) {
                await profiles.removeProfile(p.id);
            }
            // Clear legacy settings at all scopes
            const cfg = vscode.workspace.getConfiguration('codec');
            const keys = ['host', 'username', 'password'];
            for (const key of keys) {
                try {
                    await cfg.update(key, undefined, vscode.ConfigurationTarget.Global);
                }
                catch { }
                try {
                    await cfg.update(key, undefined, vscode.ConfigurationTarget.Workspace);
                }
                catch { }
                try {
                    await cfg.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
                }
                catch { }
            }
            vscode.window.showInformationMessage('RoomOS Macros: All saved profiles and credentials removed. Please restart the editor.');
        }
        catch (e) {
            vscode.window.showErrorMessage('Failed to reset data: ' + (e?.message || String(e)));
        }
    }));
    // Initialize schema service EARLY so Settings webview can query status/known products
    const schemaService = new SchemaService_1.SchemaService(context);
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.refreshSchema', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Refreshing xAPI schema…' }, async () => {
            await schemaService.refresh();
        });
        await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
        vscode.window.showInformationMessage('xAPI schema refreshed');
    }), vscode.commands.registerCommand('ciscoCodec.showSchemaJson', async () => {
        const json = await schemaService.getRootJson();
        const doc = await vscode.workspace.openTextDocument({ language: 'json', content: json });
        await vscode.window.showTextDocument(doc, { preview: true });
    }), vscode.commands.registerCommand('ciscoCodec.getSchemaStatus', async () => {
        return await schemaService.getStatus();
    }), vscode.commands.registerCommand('ciscoCodec.setForcedProduct', async (code) => {
        const cfg = vscode.workspace.getConfiguration('codec');
        const value = (code && typeof code === 'string') ? code : 'auto';
        await cfg.update('forcedProduct', value, vscode.ConfigurationTarget.Global);
        if (value === 'auto') {
            await setActiveProductFromCodec();
        }
        else {
            schemaService.setActiveProductInternal(value);
        }
        await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
    }), vscode.commands.registerCommand('ciscoCodec.getKnownProducts', async () => {
        const productMap = {
            bandai: 'Desk Mini',
            barents: 'Codec Pro',
            barents_70d: 'Room 70 Dual G2',
            barents_70i: 'Room 70 Panorama',
            barents_70s: 'Room 70 Single G2',
            barents_82i: 'Room Panorama',
            brooklyn: 'Room Bar Pro',
            darling_10_55: 'Board 55',
            darling_10_70: 'Board 70',
            darling_15_55: 'Board 55S',
            darling_15_70: 'Board 70S',
            darling_15_85: 'Board 85S',
            davinci: 'Room Bar',
            felix_55: 'Board Pro 55 G2',
            felix_75: 'Board Pro 75 G2',
            helix_55: 'Board Pro 55',
            helix_75: 'Board Pro 75',
            dx70: 'DX70',
            dx80: 'DX80',
            havella: 'Room Kit Mini',
            hopen: 'Room Kit',
            millennium: 'Codec EQ',
            mx200_g2: 'MX200 G2',
            mx300_g2: 'MX300 G2',
            mx700: 'MX700 (single cam)',
            mx700st: 'MX700 (dual cam)',
            mx800: 'MX800 (single cam)',
            mx800d: 'MX800 Dual',
            mx800st: 'MX800 (dual cam)',
            octavio: 'Desk',
            polaris: 'Desk Pro',
            spitsbergen: 'Room 55',
            svea: 'Codec Plus',
            svea_55d: 'Room 55 Dual',
            svea_70d: 'Room 70 Dual',
            svea_70s: 'Room 70 Single',
            sx10: 'SX10',
            sx20: 'SX20',
            sx80: 'SX80',
            vecchio: 'Navigator'
        };
        const list = Object.entries(productMap).map(([code, label]) => ({ code, label }));
        list.sort((a, b) => a.label.localeCompare(b.label));
        return list;
    }));
    // Register early so Settings webview can invoke it safely
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.reloadForActiveProfile', reloadForActiveProfileHandler));
    // Only import profile from settings if values are explicitly set (not defaults)
    const hostInfo = config.inspect('host');
    const userInfo = config.inspect('username');
    const passInfo = config.inspect('password');
    const hostVal = hostInfo?.workspaceValue ?? hostInfo?.globalValue ?? hostInfo?.workspaceFolderValue;
    const userVal = userInfo?.workspaceValue ?? userInfo?.globalValue ?? userInfo?.workspaceFolderValue;
    const passVal = passInfo?.workspaceValue ?? passInfo?.globalValue ?? passInfo?.workspaceFolderValue;
    if (hostVal && userVal && passVal) {
        await profiles.addProfile(hostVal, hostVal, userVal, passVal);
        try {
            // Clear at all scopes since value may come from workspace or folder
            const targets = [vscode.ConfigurationTarget.Global, vscode.ConfigurationTarget.Workspace, vscode.ConfigurationTarget.WorkspaceFolder];
            for (const t of targets) {
                try {
                    await config.update('host', undefined, t);
                }
                catch { }
                try {
                    await config.update('username', undefined, t);
                }
                catch { }
                try {
                    await config.update('password', undefined, t);
                }
                catch { }
            }
        }
        catch (err) {
            // Surface configuration write issues without breaking activation
            vscode.window.showWarningMessage(`Failed to clear legacy codec settings: ${err?.message || String(err)}`);
            console.error('Failed to clear legacy codec settings', err);
        }
    }
    const all = await profiles.listProfiles();
    if (all.length === 0) {
        vscode.window.showWarningMessage('No codec profiles configured. Use "Codec: Add Codec Profile" from the view toolbar.');
    }
    else {
        const activeId = (await profiles.getActiveProfileId()) || all[0].id;
        await profiles.setActiveProfileId(activeId);
        const active = all.find(p => p.id === activeId);
        const pass = (await profiles.getPassword(active.id)) || '';
        const manager = new MacroManager_1.MacroManager(active.host, active.username, pass);
        currentManager = manager;
        currentProfileId = active.id;
        bindManagerState(manager, active.host);
        const connectedManager = await connectWithHandling(manager, active);
        if (connectedManager) {
            currentManager = connectedManager;
            vscode.window.showInformationMessage(`Connected to codec at ${active.host}`);
            bindMacroLogs(currentManager, active.host);
        }
        // Register filesystem
        provider = new CodecFilesystem_1.CodecFileSystem(currentManager);
        context.subscriptions.push(vscode.workspace.registerFileSystemProvider('codecfs', provider, {
            isCaseSensitive: true
        }));
        // Register explorer view
        treeProvider = new MacroTreeProvider_1.MacroTreeProvider(currentManager);
        vscode.window.registerTreeDataProvider('codecMacrosExplorer', treeProvider);
    }
    // Track dirty macros (unsaved editor changes)
    const dirty = new Set();
    function updateDirtyState() {
        dirty.clear();
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.uri.scheme === 'codecfs' && doc.isDirty) {
                const name = doc.uri.path.replace(/^\//, '').replace(/\.js$/, '');
                dirty.add(name);
            }
        }
        if (treeProvider) {
            treeProvider.setDirtySet(dirty);
        }
    }
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.scheme === 'codecfs')
            updateDirtyState();
    }), vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.uri.scheme === 'codecfs')
            updateDirtyState();
    }), vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.uri.scheme === 'codecfs')
            updateDirtyState();
    }), vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.uri.scheme === 'codecfs')
            updateDirtyState();
    }));
    updateDirtyState();
    // Preload xAPI schema with a progress message, then register language features
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Getting xAPI schema…' }, async () => {
        await schemaService.preload();
    });
    (0, XapiLanguage_1.registerLanguageFeatures)(context, schemaService);
    // Apply forced product if set, otherwise detect from device
    {
        const fp = vscode.workspace.getConfiguration('codec').get('forcedProduct', 'auto');
        if (fp && fp !== 'auto') {
            schemaService.setActiveProductInternal(fp);
        }
        else {
            await setActiveProductFromCodec();
        }
    }
    async function setActiveProductFromCodec() {
        try {
            // Prefer live connected manager
            const mgr = currentManager;
            if (!mgr || !mgr.xapi)
                return;
            // Try ProductPlatform first; fall back to ProductId mapping
            let code = null;
            let platformRaw = null;
            let productIdRaw = null;
            try {
                const platform = await mgr.xapi.Status.SystemUnit.ProductPlatform.get();
                if (typeof platform === 'string' && platform.trim().length > 0) {
                    platformRaw = platform.trim();
                    const platLower = platformRaw.toLowerCase().replace(/\s+/g, '_');
                    // If platform equals a known internal code, use it; otherwise try mapping as a label
                    if (isKnownInternalCode(platLower)) {
                        code = platLower;
                    }
                    else {
                        code = resolveInternalProductCode(platformRaw);
                    }
                }
            }
            catch { }
            if (!code) {
                const productId = await mgr.xapi.Status.SystemUnit.ProductId.get();
                if (typeof productId === 'string' && productId.trim().length > 0) {
                    productIdRaw = productId.trim();
                    code = resolveInternalProductCode(productIdRaw);
                }
            }
            schemaService.setActiveProductInternal(code);
            // Provide raw identifiers to status for debugging
            try {
                schemaService.setDeviceIdentifiers?.(platformRaw, productIdRaw);
            }
            catch { }
        }
        catch (e) {
            // Non-fatal; leave product unset
        }
    }
    function resolveInternalProductCode(productLabel) {
        const productMap = {
            bandai: 'Desk Mini',
            barents: 'Codec Pro',
            barents_70d: 'Room 70 Dual G2',
            barents_70i: 'Room 70 Panorama',
            barents_70s: 'Room 70 Single G2',
            barents_82i: 'Room Panorama',
            brooklyn: 'Room Bar Pro',
            darling_10_55: 'Board 55',
            darling_10_70: 'Board 70',
            darling_15_55: 'Board 55S',
            darling_15_70: 'Board 70S',
            darling_15_85: 'Board 85S',
            davinci: 'Room Bar',
            felix_55: 'Board Pro 55 G2',
            felix_75: 'Board Pro 75 G2',
            helix_55: 'Board Pro 55',
            helix_75: 'Board Pro 75',
            dx70: 'DX70',
            dx80: 'DX80',
            havella: 'Room Kit Mini',
            hopen: 'Room Kit',
            millennium: 'Codec EQ',
            mx200_g2: 'MX200 G2',
            mx300_g2: 'MX300 G2',
            mx700: 'MX700 (single cam)',
            mx700st: 'MX700 (dual cam)',
            mx800: 'MX800 (single cam)',
            mx800d: 'MX800 Dual',
            mx800st: 'MX800 (dual cam)',
            octavio: 'Desk',
            polaris: 'Desk Pro',
            spitsbergen: 'Room 55',
            svea: 'Codec Plus',
            svea_55d: 'Room 55 Dual',
            svea_70d: 'Room 70 Dual',
            svea_70s: 'Room 70 Single',
            sx10: 'SX10',
            sx20: 'SX20',
            sx80: 'SX80',
            vecchio: 'Navigator'
        };
        const normalize = (s) => s.toLowerCase().replace(/^cisco\s+|^webex\s+/g, '').replace(/\s+series$/g, '').trim();
        const target = normalize(productLabel);
        // exact
        for (const [code, label] of Object.entries(productMap)) {
            if (normalize(label) === target)
                return code;
        }
        // contains either way
        for (const [code, label] of Object.entries(productMap)) {
            const norm = normalize(label);
            if (norm.includes(target) || target.includes(norm))
                return code;
        }
        return null;
    }
    function isKnownInternalCode(code) {
        const known = new Set([
            'bandai', 'barents', 'barents_70d', 'barents_70i', 'barents_70s', 'barents_82i', 'brooklyn', 'darling_10_55', 'darling_10_70', 'darling_15_55', 'darling_15_70', 'darling_15_85', 'davinci', 'felix_55', 'felix_75', 'helix_55', 'helix_75', 'dx70', 'dx80', 'havella', 'hopen', 'millennium', 'mx200_g2', 'mx300_g2', 'mx700', 'mx700st', 'mx800', 'mx800d', 'mx800st', 'octavio', 'polaris', 'spitsbergen', 'svea', 'svea_55d', 'svea_70d', 'svea_70s', 'sx10', 'sx20', 'sx80', 'vecchio'
        ]);
        return known.has(code);
    }
    async function ensureNoUnsavedCodecDocs() {
        const dirtyCodecDocs = vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'codecfs' && doc.isDirty);
        if (dirtyCodecDocs.length === 0) {
            return true;
        }
        const choice = await vscode.window.showWarningMessage(`You have ${dirtyCodecDocs.length} unsaved macro(s). Save all before switching profiles?`, { modal: true }, 'Save All and Switch');
        if (choice !== 'Save All and Switch') {
            return false;
        }
        // Save only codecfs docs to avoid unexpected side-effects
        const results = await Promise.all(dirtyCodecDocs.map(d => d.save()));
        const allSaved = results.every(Boolean);
        if (!allSaved) {
            vscode.window.showErrorMessage('Some macros failed to save. Aborting profile switch.');
            return false;
        }
        return true;
    }
    // Register command to open a macro using our virtual FS
    async function reloadForActiveProfileHandler() {
        try {
            // Prevent switching if there are unsaved codec macros
            const listBefore = await profiles.listProfiles();
            const activeIdBefore = await profiles.getActiveProfileId();
            const isChanging = !!(activeIdBefore && currentProfileId && activeIdBefore !== currentProfileId);
            if (isChanging) {
                const ok = await ensureNoUnsavedCodecDocs();
                if (!ok) {
                    // Revert active id to current if it's still present
                    const stillExists = listBefore.some(p => p.id === currentProfileId);
                    if (stillExists && currentProfileId) {
                        await profiles.setActiveProfileId(currentProfileId);
                    }
                    vscode.window.showWarningMessage('Profile switch cancelled due to unsaved macros.');
                    return;
                }
            }
            const list = await profiles.listProfiles();
            const activeIdNow = await profiles.getActiveProfileId();
            const selected = list.find(p => p.id === activeIdNow);
            if (!selected) {
                vscode.window.showWarningMessage('No active profile selected.');
                return;
            }
            const password = (await profiles.getPassword(selected.id)) || '';
            // Cleanly disconnect previous manager before switching
            try {
                await currentManager?.disconnect();
            }
            catch { }
            const newManager = new MacroManager_1.MacroManager(selected.host, selected.username, password);
            const connected = await connectWithHandling(newManager, selected);
            if (!connected) {
                // Keep using existing manager if connection failed
                return;
            }
            const effectiveManager = connected;
            currentManager = effectiveManager;
            currentProfileId = selected.id;
            bindManagerState(effectiveManager, selected.host);
            bindMacroLogs(effectiveManager, selected.host);
            // Re-register provider to ensure fresh handle after reconnect
            try {
                if (provider) {
                    provider.setManager(currentManager);
                }
                else {
                    provider = new CodecFilesystem_1.CodecFileSystem(currentManager);
                }
                // Re-register regardless to refresh the scheme binding
                context.subscriptions.push(vscode.workspace.registerFileSystemProvider('codecfs', provider, { isCaseSensitive: true }));
            }
            catch { }
            if (!treeProvider) {
                treeProvider = new MacroTreeProvider_1.MacroTreeProvider(currentManager);
                vscode.window.registerTreeDataProvider('codecMacrosExplorer', treeProvider);
            }
            else {
                treeProvider.setManager(currentManager);
            }
            vscode.window.showInformationMessage(`Switched to ${selected.label} (${selected.host})`);
            const forcedNow = vscode.workspace.getConfiguration('codec').get('forcedProduct', 'auto');
            if (forcedNow && forcedNow !== 'auto') {
                schemaService.setActiveProductInternal(forcedNow);
            }
            else {
                await setActiveProductFromCodec();
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to switch profile: ${err?.message || String(err)}`);
        }
    }
    async function connectWithHandling(manager, profile) {
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Connecting to ${profile.host}…` }, async () => {
                await withTimeout(manager.connect(), 10000, 'connect');
            });
            return manager;
        }
        catch (err) {
            const category = categorizeConnectionError(err);
            if (category === 'auth') {
                const newPassword = await vscode.window.showInputBox({ prompt: `Authentication failed for ${profile.username}@${profile.host}. Enter password to retry:`, password: true, ignoreFocusOut: true });
                if (newPassword === undefined) {
                    vscode.window.showErrorMessage('Authentication failed. Update your password in Settings and try again.');
                    return null;
                }
                try {
                    await profiles.updateProfile(profile.id, {}, newPassword);
                    const updatedPassword = (await profiles.getPassword(profile.id)) || '';
                    const retryManager = new MacroManager_1.MacroManager(profile.host, profile.username, updatedPassword);
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Reconnecting to ${profile.host}…` }, async () => {
                        await withTimeout(retryManager.connect(), 10000, 'connect');
                    });
                    return retryManager;
                }
                catch (retryErr) {
                    vscode.window.showErrorMessage(`Failed to connect after updating password: ${retryErr?.message || String(retryErr)}`);
                    return null;
                }
            }
            if (category === 'tls') {
                const choice = await vscode.window.showErrorMessage(`TLS certificate error connecting to ${profile.host}. Ensure the device has a valid certificate trusted by your system.`, 'Retry', 'Open Settings');
                if (choice === 'Open Settings') {
                    await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
                    return null;
                }
                if (choice === 'Retry') {
                    try {
                        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Reconnecting to ${profile.host}…` }, async () => {
                            await withTimeout(manager.connect(), 10000, 'connect');
                        });
                        return manager;
                    }
                    catch { }
                }
                return null;
            }
            if (category === 'unreachable' || category === 'timeout') {
                const choice = await vscode.window.showErrorMessage(`Cannot reach ${profile.host}. Check hostname/IP, network/VPN, and firewall.`, 'Retry', 'Open Settings');
                if (choice === 'Open Settings') {
                    await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
                    return null;
                }
                if (choice === 'Retry') {
                    try {
                        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Reconnecting to ${profile.host}…` }, async () => {
                            await withTimeout(manager.connect(), 10000, 'connect');
                        });
                        return manager;
                    }
                    catch { }
                }
                return null;
            }
            vscode.window.showErrorMessage(`Failed to connect to codec: ${err?.message || String(err)}`);
            return null;
        }
    }
    function categorizeConnectionError(err) {
        const message = (err?.message || '').toLowerCase();
        const code = (err?.code || err?.errno || err?.cause?.code || '').toString().toUpperCase();
        if (message.includes('auth') ||
            message.includes('unauthorized') ||
            message.includes('forbidden') ||
            message.includes('login') ||
            message.includes('password') ||
            message.includes('401') ||
            message.includes('403')) {
            return 'auth';
        }
        if (code === 'ENOTFOUND' ||
            code === 'EAI_AGAIN' ||
            code === 'ECONNREFUSED' ||
            code === 'EHOSTUNREACH' ||
            code === 'ENETUNREACH' ||
            message.includes('getaddrinfo') ||
            message.includes('refused') ||
            message.includes('unreachable')) {
            return 'unreachable';
        }
        if (code === 'ETIMEDOUT' || message.includes('timed out') || message.includes('timeout')) {
            return 'timeout';
        }
        if (code === 'CERT_HAS_EXPIRED' ||
            code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
            code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            message.includes('ssl') ||
            message.includes('tls') ||
            message.includes('certificate') ||
            message.includes('self signed')) {
            return 'tls';
        }
        return 'other';
    }
    function withTimeout(promise, ms, label) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const err = new Error(`${label} timed out after ${ms}ms`);
                err.code = 'ETIMEDOUT';
                reject(err);
            }, ms);
        });
        return Promise.race([promise, timeout]).then((val) => {
            clearTimeout(timer);
            return val;
        }, (err) => {
            clearTimeout(timer);
            throw err;
        });
    }
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.openMacro', async (macroName) => {
        try {
            const uri = vscode.Uri.parse(`codecfs:/${macroName}.js`);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: false });
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to open macro: ' + (err.message || String(err)));
        }
    }));
    // Create new macro
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.createMacro', async () => {
        const mgr = getManagerOrWarn();
        if (!mgr)
            return;
        const name = await vscode.window.showInputBox({ prompt: 'New macro name (without .js)' });
        if (!name)
            return;
        try {
            await mgr.create(name, '');
            vscode.window.showInformationMessage(`Created macro ${name}`);
            await treeProvider?.fetchMacros();
            const uri = vscode.Uri.parse(`codecfs:/${name}.js`);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: false });
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to create macro: ' + (err.message || String(err)));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.deleteMacro', async (arg) => {
        const mgr = getManagerOrWarn();
        if (!mgr)
            return;
        const macroName = typeof arg === 'string' ? arg : arg?.label;
        if (!macroName)
            return;
        const confirmEnabled = vscode.workspace.getConfiguration('codec').get('confirmMacroDelete', true);
        if (confirmEnabled) {
            const confirm = await vscode.window.showWarningMessage(`Remove macro "${macroName}"?`, { modal: true }, 'Remove');
            if (confirm !== 'Remove')
                return;
        }
        try {
            await mgr.remove(macroName);
            vscode.window.showInformationMessage(`Removed macro ${macroName}`);
            await treeProvider?.fetchMacros();
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to remove macro: ' + (err.message || String(err)));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.renameMacro', async (arg) => {
        const mgr = getManagerOrWarn();
        if (!mgr)
            return;
        const macroName = typeof arg === 'string' ? arg : arg?.label;
        if (!macroName)
            return;
        const newName = await vscode.window.showInputBox({ prompt: 'New macro name', value: macroName });
        if (!newName || newName === macroName)
            return;
        try {
            await mgr.rename(macroName, newName);
            vscode.window.showInformationMessage(`Renamed macro ${macroName} → ${newName}`);
            await treeProvider?.fetchMacros();
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to rename macro: ' + (err.message || String(err)));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.activateMacro', async (arg) => {
        const mgr = getManagerOrWarn();
        if (!mgr)
            return;
        const macroName = typeof arg === 'string' ? arg : arg?.label;
        if (!macroName)
            return;
        try {
            await mgr.activate(macroName);
            vscode.window.showInformationMessage(`Activated macro ${macroName}`);
            await treeProvider?.fetchMacros();
            const autoRestart = vscode.workspace.getConfiguration('codec').get('autoRestartOnActivateDeactivate', false);
            if (autoRestart) {
                try {
                    await mgr.restartFramework();
                    vscode.window.showInformationMessage('Macro framework restarted');
                }
                catch (e) {
                    vscode.window.showWarningMessage('Macro activated, but failed to restart framework: ' + (e?.message || String(e)));
                }
            }
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to activate macro: ' + (err.message || String(err)));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.deactivateMacro', async (arg) => {
        const mgr = getManagerOrWarn();
        if (!mgr)
            return;
        const macroName = typeof arg === 'string' ? arg : arg?.label;
        if (!macroName)
            return;
        try {
            await mgr.deactivate(macroName);
            vscode.window.showInformationMessage(`Deactivated macro ${macroName}`);
            await treeProvider?.fetchMacros();
            const autoRestart = vscode.workspace.getConfiguration('codec').get('autoRestartOnActivateDeactivate', false);
            if (autoRestart) {
                try {
                    await mgr.restartFramework();
                    vscode.window.showInformationMessage('Macro framework restarted');
                }
                catch (e) {
                    vscode.window.showWarningMessage('Macro deactivated, but failed to restart framework: ' + (e?.message || String(e)));
                }
            }
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to deactivate macro: ' + (err.message || String(err)));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.restartMacroFramework', async () => {
        const mgr = getManagerOrWarn();
        if (!mgr)
            return;
        const confirmEnabled = vscode.workspace.getConfiguration('codec').get('confirmFrameworkRestart', true);
        if (confirmEnabled) {
            const confirm = await vscode.window.showWarningMessage('Restart Macro Framework on device?', { modal: true }, 'Restart');
            if (confirm !== 'Restart')
                return;
        }
        try {
            await mgr.restartFramework();
            vscode.window.showInformationMessage('Macro framework restarted');
            await treeProvider?.fetchMacros();
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to restart macro framework: ' + (err.message || String(err)));
        }
    }));
    // Profile management commands
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.switchProfile', async () => {
        const ok = await ensureNoUnsavedCodecDocs();
        if (!ok)
            return;
        const list = await profiles.listProfiles();
        if (list.length === 0) {
            vscode.window.showWarningMessage('No profiles available.');
            return;
        }
        const picked = await vscode.window.showQuickPick(list.map(p => ({ label: p.label, description: `${p.host} (${p.username})`, id: p.id })), { placeHolder: 'Select codec profile' });
        if (!picked)
            return;
        await profiles.setActiveProfileId(picked.id);
        await vscode.commands.executeCommand('ciscoCodec.reloadForActiveProfile');
    }));
}
async function promptAddProfile(profiles) {
    const label = await vscode.window.showInputBox({ prompt: 'Profile name (e.g., Boardroom 1)' });
    if (!label)
        return;
    const host = await vscode.window.showInputBox({ prompt: 'Codec host (IP or hostname)' });
    if (!host)
        return;
    const username = await vscode.window.showInputBox({ prompt: 'Username', value: 'admin' });
    if (!username)
        return;
    const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
    if (password === undefined)
        return;
    return profiles.addProfile(label, host, username, password);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map