import * as vscode from 'vscode';
import { MacroManager } from './MacroManager';
import { CodecFileSystem } from './CodecFilesystem';
import { MacroTreeProvider } from './MacroTreeProvider';
import { ProfileStore, CodecProfileInfo } from './ProfileStore';
import { ProfilesWebview } from './ProfilesWebview';
import { registerLanguageFeatures } from './XapiLanguage';
import { SchemaService } from './SchemaService';

export async function activate(context: vscode.ExtensionContext) {
  const profiles = new ProfileStore(context);
  const config = vscode.workspace.getConfiguration('codec');
  // Hoisted state so commands work before first connection
  let currentManager: MacroManager | null = null;
  let currentProfileId: string | null = null;
  let provider: CodecFileSystem | null = null;
  let treeProvider: MacroTreeProvider | null = null;
  const getManagerOrWarn = (): MacroManager | null => {
    if (!currentManager) {
      vscode.window.showWarningMessage('No active codec connection. Add and activate a profile in Settings.');
      return null;
    }
    return currentManager;
  };
  // Ensure Settings UI is available even if activation exits early
  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.manageProfiles', async () => {
      const web = new ProfilesWebview(context, profiles);
      await web.show();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.addProfile', async () => {
      const added = await promptAddProfile(profiles);
      if (added) {
        vscode.window.showInformationMessage(`Added profile ${added.label}`);
      }
    })
  );
  // Initialize schema service EARLY so Settings webview can query status/known products
  const schemaService = new SchemaService(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.refreshSchema', async () => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Refreshing xAPI schema…' }, async () => {
        await schemaService.refresh();
      });
      await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
      vscode.window.showInformationMessage('xAPI schema refreshed');
    }),
    vscode.commands.registerCommand('ciscoCodec.showSchemaJson', async () => {
      const json = await schemaService.getRootJson();
      const doc = await vscode.workspace.openTextDocument({ language: 'json', content: json });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
    vscode.commands.registerCommand('ciscoCodec.getSchemaStatus', async () => {
      return await schemaService.getStatus();
    }),
    vscode.commands.registerCommand('ciscoCodec.setForcedProduct', async (code: string) => {
      const cfg = vscode.workspace.getConfiguration('codec');
      const value = (code && typeof code === 'string') ? code : 'auto';
      await cfg.update('forcedProduct', value, vscode.ConfigurationTarget.Global);
      if (value === 'auto') {
        await setActiveProductFromCodec();
      } else {
        schemaService.setActiveProductInternal(value);
      }
      await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
    }),
    vscode.commands.registerCommand('ciscoCodec.getKnownProducts', async () => {
      const productMap: Record<string, string> = {
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
    })
  );

  // Register early so Settings webview can invoke it safely
  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.reloadForActiveProfile', reloadForActiveProfileHandler)
  );
  // Only import profile from settings if values are explicitly set (not defaults)
  const hostInfo = config.inspect<string>('host');
  const userInfo = config.inspect<string>('username');
  const passInfo = config.inspect<string>('password');
  const hostVal = hostInfo?.workspaceValue ?? hostInfo?.globalValue ?? hostInfo?.workspaceFolderValue;
  const userVal = userInfo?.workspaceValue ?? userInfo?.globalValue ?? userInfo?.workspaceFolderValue;
  const passVal = passInfo?.workspaceValue ?? passInfo?.globalValue ?? passInfo?.workspaceFolderValue;
  if (hostVal && userVal && passVal) {
    await profiles.addProfile(hostVal, hostVal, userVal, passVal);
    try {
      await config.update('host', undefined, vscode.ConfigurationTarget.Global);
      await config.update('username', undefined, vscode.ConfigurationTarget.Global);
      await config.update('password', undefined, vscode.ConfigurationTarget.Global);
    } catch (err: any) {
      // Surface configuration write issues without breaking activation
      vscode.window.showWarningMessage(`Failed to clear legacy codec settings: ${err?.message || String(err)}`);
      console.error('Failed to clear legacy codec settings', err);
    }
  }

  const all = await profiles.listProfiles();
  if (all.length === 0) {
    vscode.window.showWarningMessage('No codec profiles configured. Use "Codec: Add Codec Profile" from the view toolbar.');
  } else {
    const activeId = (await profiles.getActiveProfileId()) || all[0].id;
    await profiles.setActiveProfileId(activeId);
    const active = all.find(p => p.id === activeId)!;
    const pass = (await profiles.getPassword(active.id)) || '';

    const manager = new MacroManager(active.host, active.username, pass);
    currentManager = manager;
    currentProfileId = active.id;
    const connectedManager = await connectWithHandling(manager, active);
    if (connectedManager) {
      currentManager = connectedManager;
      vscode.window.showInformationMessage(`Connected to codec at ${active.host}`);
    }
    // Register filesystem
    provider = new CodecFileSystem(currentManager);
    context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider('codecfs', provider, {
        isCaseSensitive: true
      })
    );

    // Register explorer view
    treeProvider = new MacroTreeProvider(currentManager);
    vscode.window.registerTreeDataProvider('codecMacrosExplorer', treeProvider);
  }

  // Track dirty macros (unsaved editor changes)
  const dirty = new Set<string>();
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.scheme === 'codecfs') updateDirtyState();
    }),
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.scheme === 'codecfs') updateDirtyState();
    }),
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.uri.scheme === 'codecfs') updateDirtyState();
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.uri.scheme === 'codecfs') updateDirtyState();
    })
  );
  updateDirtyState();

  // Preload xAPI schema with a progress message, then register language features
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Getting xAPI schema…' }, async () => {
    await schemaService.preload();
  });
  registerLanguageFeatures(context, schemaService);

  // Apply forced product if set, otherwise detect from device
  {
    const fp = vscode.workspace.getConfiguration('codec').get<string>('forcedProduct', 'auto');
    if (fp && fp !== 'auto') {
      schemaService.setActiveProductInternal(fp);
    } else {
      await setActiveProductFromCodec();
    }
  }

  async function setActiveProductFromCodec() {
    try {
      // Prefer live connected manager
      const mgr = currentManager;
      if (!mgr || !(mgr as any).xapi) return;
      // Try ProductPlatform first; fall back to ProductId mapping
      let code: string | null = null;
      let platformRaw: string | null = null;
      let productIdRaw: string | null = null;
      try {
        const platform = await (mgr as any).xapi.Status.SystemUnit.ProductPlatform.get();
        if (typeof platform === 'string' && platform.trim().length > 0) {
          platformRaw = platform.trim();
          const platLower = platformRaw.toLowerCase().replace(/\s+/g, '_');
          // If platform equals a known internal code, use it; otherwise try mapping as a label
          if (isKnownInternalCode(platLower)) {
            code = platLower;
          } else {
            code = resolveInternalProductCode(platformRaw);
          }
        }
      } catch {}
      if (!code) {
        const productId = await (mgr as any).xapi.Status.SystemUnit.ProductId.get();
        if (typeof productId === 'string' && productId.trim().length > 0) {
          productIdRaw = productId.trim();
          code = resolveInternalProductCode(productIdRaw);
        }
      }
      schemaService.setActiveProductInternal(code);
      // Provide raw identifiers to status for debugging
      try {
        (schemaService as any).setDeviceIdentifiers?.(platformRaw, productIdRaw);
      } catch {}
    } catch (e) {
      // Non-fatal; leave product unset
    }
  }

  function resolveInternalProductCode(productLabel: string): string | null {
    const productMap: Record<string, string> = {
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
    const normalize = (s: string) => s.toLowerCase().replace(/^cisco\s+|^webex\s+/g, '').replace(/\s+series$/g, '').trim();
    const target = normalize(productLabel);
    // exact
    for (const [code, label] of Object.entries(productMap)) {
      if (normalize(label) === target) return code;
    }
    // contains either way
    for (const [code, label] of Object.entries(productMap)) {
      const norm = normalize(label);
      if (norm.includes(target) || target.includes(norm)) return code;
    }
    return null;
  }

  function isKnownInternalCode(code: string): boolean {
    const known = new Set([
      'bandai','barents','barents_70d','barents_70i','barents_70s','barents_82i','brooklyn','darling_10_55','darling_10_70','darling_15_55','darling_15_70','darling_15_85','davinci','felix_55','felix_75','helix_55','helix_75','dx70','dx80','havella','hopen','millennium','mx200_g2','mx300_g2','mx700','mx700st','mx800','mx800d','mx800st','octavio','polaris','spitsbergen','svea','svea_55d','svea_70d','svea_70s','sx10','sx20','sx80','vecchio'
    ]);
    return known.has(code);
  }

  async function ensureNoUnsavedCodecDocs(): Promise<boolean> {
    const dirtyCodecDocs = vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'codecfs' && doc.isDirty);
    if (dirtyCodecDocs.length === 0) {
      return true;
    }
    const choice = await vscode.window.showWarningMessage(
      `You have ${dirtyCodecDocs.length} unsaved macro(s). Save all before switching profiles?`,
      { modal: true },
      'Save All and Switch'
    );
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
        const newManager = new MacroManager(selected.host, selected.username, password);
        const connected = await connectWithHandling(newManager, selected);
        if (!connected) {
          // Keep using existing manager if connection failed
          return;
        }
        const effectiveManager = connected;
        currentManager = effectiveManager;
        currentProfileId = selected.id;

        if (!provider) {
          provider = new CodecFileSystem(currentManager);
          context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider('codecfs', provider, { isCaseSensitive: true })
          );
        } else {
          provider.setManager(currentManager);
        }

        if (!treeProvider) {
          treeProvider = new MacroTreeProvider(currentManager);
          vscode.window.registerTreeDataProvider('codecMacrosExplorer', treeProvider);
        } else {
          treeProvider.setManager(currentManager);
        }

        vscode.window.showInformationMessage(`Switched to ${selected.label} (${selected.host})`);
        const forcedNow = vscode.workspace.getConfiguration('codec').get<string>('forcedProduct', 'auto');
        if (forcedNow && forcedNow !== 'auto') {
          schemaService.setActiveProductInternal(forcedNow);
        } else {
          await setActiveProductFromCodec();
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to switch profile: ${err?.message || String(err)}`);
      }
  }

  async function connectWithHandling(manager: MacroManager, profile: CodecProfileInfo): Promise<MacroManager | null> {
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Connecting to ${profile.host}…` }, async () => {
        await withTimeout(manager.connect(), 10000, 'connect');
        // Verify credentials quickly to avoid false positives where socket opens but auth fails later
        await withTimeout(manager.verifyConnection(), 5000, 'verify');
      });
      return manager;
    } catch (err: any) {
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
          const retryManager = new MacroManager(profile.host, profile.username, updatedPassword);
          await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Reconnecting to ${profile.host}…` }, async () => {
            await withTimeout(retryManager.connect(), 10000, 'connect');
            await withTimeout(retryManager.verifyConnection(), 5000, 'verify');
          });
          return retryManager;
        } catch (retryErr: any) {
          vscode.window.showErrorMessage(`Failed to connect after updating password: ${retryErr?.message || String(retryErr)}`);
          return null;
        }
      }
      if (category === 'tls') {
        const choice = await vscode.window.showErrorMessage(
          `TLS certificate error connecting to ${profile.host}. Ensure the device has a valid certificate trusted by your system.`,
          'Retry',
          'Open Settings'
        );
        if (choice === 'Open Settings') {
          await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
          return null;
        }
        if (choice === 'Retry') {
          try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Reconnecting to ${profile.host}…` }, async () => {
              await withTimeout(manager.connect(), 10000, 'connect');
              await withTimeout(manager.verifyConnection(), 5000, 'verify');
            });
            return manager;
          } catch {}
        }
        return null;
      }
      if (category === 'unreachable' || category === 'timeout') {
        const choice = await vscode.window.showErrorMessage(
          `Cannot reach ${profile.host}. Check hostname/IP, network/VPN, and firewall.`,
          'Retry',
          'Open Settings'
        );
        if (choice === 'Open Settings') {
          await vscode.commands.executeCommand('ciscoCodec.manageProfiles');
          return null;
        }
        if (choice === 'Retry') {
          try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Reconnecting to ${profile.host}…` }, async () => {
              await withTimeout(manager.connect(), 10000, 'connect');
              await withTimeout(manager.verifyConnection(), 5000, 'verify');
            });
            return manager;
          } catch {}
        }
        return null;
      }
      vscode.window.showErrorMessage(`Failed to connect to codec: ${err?.message || String(err)}`);
      return null;
    }
  }

  function categorizeConnectionError(err: any): 'auth' | 'unreachable' | 'timeout' | 'tls' | 'other' {
    const message = (err?.message || '').toLowerCase();
    const code = (err?.code || err?.errno || err?.cause?.code || '').toString().toUpperCase();
    // Authentication
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('login') ||
      message.includes('password') ||
      message.includes('401')
    ) {
      return 'auth';
    }
    // Unreachable / DNS / refused
    if (
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === 'ECONNREFUSED' ||
      code === 'EHOSTUNREACH' ||
      code === 'ENETUNREACH' ||
      message.includes('getaddrinfo') ||
      message.includes('refused') ||
      message.includes('unreachable')
    ) {
      return 'unreachable';
    }
    // Timeout
    if (code === 'ETIMEDOUT' || message.includes('timed out') || message.includes('timeout')) {
      return 'timeout';
    }
    // TLS / certificate
    if (
      code === 'CERT_HAS_EXPIRED' ||
      code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      message.includes('ssl') ||
      message.includes('tls') ||
      message.includes('certificate') ||
      message.includes('self signed')
    ) {
      return 'tls';
    }
    return 'other';
  }

  function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err: any = new Error(`${label} timed out after ${ms}ms`);
        err.code = 'ETIMEDOUT';
        reject(err);
      }, ms);
    });
    return Promise.race([promise, timeout]).then((val: any) => {
      clearTimeout(timer!);
      return val as T;
    }, (err) => {
      clearTimeout(timer!);
      throw err;
    });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.openMacro', async (macroName: string) => {
      try {
        const uri = vscode.Uri.parse(`codecfs:/${macroName}.js`);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to open macro: ' + (err.message || String(err)));
      }
    })
  );

  // Create new macro
  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.createMacro', async () => {
      const mgr = getManagerOrWarn();
      if (!mgr) return;
      const name = await vscode.window.showInputBox({ prompt: 'New macro name (without .js)' });
      if (!name) return;
      try {
        await mgr.create(name, '');
        vscode.window.showInformationMessage(`Created macro ${name}`);
        await treeProvider?.fetchMacros();
        const uri = vscode.Uri.parse(`codecfs:/${name}.js`);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to create macro: ' + (err.message || String(err)));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.deleteMacro', async (arg: any) => {
      const mgr = getManagerOrWarn();
      if (!mgr) return;
      const macroName = typeof arg === 'string' ? arg : arg?.label;
      if (!macroName) return;
      const confirmEnabled = vscode.workspace.getConfiguration('codec').get<boolean>('confirmMacroDelete', true);
      if (confirmEnabled) {
        const confirm = await vscode.window.showWarningMessage(`Remove macro "${macroName}"?`, { modal: true }, 'Remove');
        if (confirm !== 'Remove') return;
      }
      try {
        await mgr.remove(macroName);
        vscode.window.showInformationMessage(`Removed macro ${macroName}`);
        await treeProvider?.fetchMacros();
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to remove macro: ' + (err.message || String(err)));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.renameMacro', async (arg: any) => {
      const mgr = getManagerOrWarn();
      if (!mgr) return;
      const macroName = typeof arg === 'string' ? arg : arg?.label;
      if (!macroName) return;
      const newName = await vscode.window.showInputBox({ prompt: 'New macro name', value: macroName });
      if (!newName || newName === macroName) return;
      try {
        await mgr.rename(macroName, newName);
        vscode.window.showInformationMessage(`Renamed macro ${macroName} → ${newName}`);
        await treeProvider?.fetchMacros();
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to rename macro: ' + (err.message || String(err)));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.activateMacro', async (arg: any) => {
      const mgr = getManagerOrWarn();
      if (!mgr) return;
      const macroName = typeof arg === 'string' ? arg : arg?.label;
      if (!macroName) return;
      try {
        await mgr.activate(macroName);
        vscode.window.showInformationMessage(`Activated macro ${macroName}`);
        await treeProvider?.fetchMacros();
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to activate macro: ' + (err.message || String(err)));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.deactivateMacro', async (arg: any) => {
      const mgr = getManagerOrWarn();
      if (!mgr) return;
      const macroName = typeof arg === 'string' ? arg : arg?.label;
      if (!macroName) return;
      try {
        await mgr.deactivate(macroName);
        vscode.window.showInformationMessage(`Deactivated macro ${macroName}`);
        await treeProvider?.fetchMacros();
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to deactivate macro: ' + (err.message || String(err)));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.restartMacroFramework', async () => {
      const mgr = getManagerOrWarn();
      if (!mgr) return;
      const confirmEnabled = vscode.workspace.getConfiguration('codec').get<boolean>('confirmFrameworkRestart', true);
      if (confirmEnabled) {
        const confirm = await vscode.window.showWarningMessage('Restart Macro Framework on device?', { modal: true }, 'Restart');
        if (confirm !== 'Restart') return;
      }
      try {
        await mgr.restartFramework();
        vscode.window.showInformationMessage('Macro framework restarted');
        await treeProvider?.fetchMacros();
      } catch (err: any) {
        vscode.window.showErrorMessage('Failed to restart macro framework: ' + (err.message || String(err)));
      }
    })
  );

  // Profile management commands

  context.subscriptions.push(
    vscode.commands.registerCommand('ciscoCodec.switchProfile', async () => {
      const ok = await ensureNoUnsavedCodecDocs();
      if (!ok) return;
      const list = await profiles.listProfiles();
      if (list.length === 0) {
        vscode.window.showWarningMessage('No profiles available.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        list.map(p => ({ label: p.label, description: `${p.host} (${p.username})`, id: p.id })),
        { placeHolder: 'Select codec profile' }
      );
      if (!picked) return;
      await profiles.setActiveProfileId(picked.id);
      await vscode.commands.executeCommand('ciscoCodec.reloadForActiveProfile');
    })
  );
}

async function promptAddProfile(profiles: ProfileStore) {
  const label = await vscode.window.showInputBox({ prompt: 'Profile name (e.g., Boardroom 1)' });
  if (!label) return;
  const host = await vscode.window.showInputBox({ prompt: 'Codec host (IP or hostname)' });
  if (!host) return;
  const username = await vscode.window.showInputBox({ prompt: 'Username', value: 'admin' });
  if (!username) return;
  const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
  if (password === undefined) return;
  return profiles.addProfile(label, host, username, password);
}

export function deactivate() {}
