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
    const getManagerOrWarn = () => {
        if (!currentManager) {
            vscode.window.showWarningMessage('No active codec connection. Add and activate a profile in Settings.');
            return null;
        }
        return currentManager;
    };
    // Ensure Settings UI is available even if activation exits early
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.manageProfiles', async () => {
        const web = new ProfilesWebview_1.ProfilesWebview(context, profiles);
        await web.show();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.addProfile', async () => {
        const added = await promptAddProfile(profiles);
        if (added) {
            vscode.window.showInformationMessage(`Added profile ${added.label}`);
        }
    }));
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
            await config.update('host', undefined, vscode.ConfigurationTarget.Global);
            await config.update('username', undefined, vscode.ConfigurationTarget.Global);
            await config.update('password', undefined, vscode.ConfigurationTarget.Global);
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
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Connecting to ${active.host}…` }, async () => {
                await manager.connect();
            });
            vscode.window.showInformationMessage(`Connected to codec at ${active.host}`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to connect to codec: ${err.message || err}`);
            console.error("Connection error:", err);
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
    const schemaService = new SchemaService_1.SchemaService(context);
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Getting xAPI schema…' }, async () => {
        await schemaService.preload();
    });
    (0, XapiLanguage_1.registerLanguageFeatures)(context, schemaService);
    // Expose schema service to settings webview via commands/messages
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.refreshSchema', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Refreshing xAPI schema…' }, async () => {
            await schemaService.refresh();
        });
        // Notify settings webview to update immediately
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
    context.subscriptions.push(vscode.commands.registerCommand('ciscoCodec.reloadForActiveProfile', async () => {
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
            const newManager = new MacroManager_1.MacroManager(selected.host, selected.username, password);
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Connecting to ${selected.host}…` }, async () => {
                await newManager.connect();
            });
            currentManager = newManager;
            currentProfileId = selected.id;
            if (!provider) {
                provider = new CodecFilesystem_1.CodecFileSystem(currentManager);
                context.subscriptions.push(vscode.workspace.registerFileSystemProvider('codecfs', provider, { isCaseSensitive: true }));
            }
            else {
                provider.setManager(currentManager);
            }
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
    }));
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