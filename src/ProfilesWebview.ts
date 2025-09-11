import * as vscode from 'vscode';
import { ProfileStore } from './ProfileStore';

export class ProfilesWebview {
  private panel: vscode.WebviewPanel | null = null;
  constructor(private context: vscode.ExtensionContext, private store: ProfileStore) {}

  async show() {
    if (this.panel) {
      this.panel.title = 'Settings';
      this.panel.reveal();
      await this.postState();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'codecProfiles',
      'Settings',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => (this.panel = null));
    this.panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg.type === 'add') {
          await this.store.addProfile(msg.label, msg.host, msg.username, msg.password);
        } else if (msg.type === 'setActive') {
          await this.store.setActiveProfileId(msg.id);
          await vscode.commands.executeCommand('ciscoCodec.reloadForActiveProfile');
        } else if (msg.type === 'delete') {
          await this.store.removeProfile(msg.id);
          await vscode.commands.executeCommand('ciscoCodec.reloadForActiveProfile');
        } else if (msg.type === 'update') {
          await this.store.updateProfile(msg.originalId, msg.updates, msg.password);
          await vscode.commands.executeCommand('ciscoCodec.reloadForActiveProfile');
        } else if (msg.type === 'setAutoRestart') {
          await vscode.workspace.getConfiguration('codec').update('autoRestartOnSave', !!msg.value, vscode.ConfigurationTarget.Global);
        } else if (msg.type === 'refreshSchema') {
          await vscode.commands.executeCommand('ciscoCodec.refreshSchema');
        } else if (msg.type === 'showSchemaJson') {
          await vscode.commands.executeCommand('ciscoCodec.showSchemaJson');
        } else if (msg.type === 'setConfirmMacroDelete') {
          await vscode.workspace.getConfiguration('codec').update('confirmMacroDelete', !!msg.value, vscode.ConfigurationTarget.Global);
        } else if (msg.type === 'setConfirmFrameworkRestart') {
          await vscode.workspace.getConfiguration('codec').update('confirmFrameworkRestart', !!msg.value, vscode.ConfigurationTarget.Global);
        } else if (msg.type === 'setForcedProduct') {
          await vscode.commands.executeCommand('ciscoCodec.setForcedProduct', String(msg.value || 'auto'));
        }
        await this.postState();
      } catch (e: any) {
        vscode.window.showErrorMessage(e.message || String(e));
      }
    });

    this.panel.webview.html = this.renderHtml();
    await this.postState();
  }

  private async postState() {
    if (!this.panel) return;
    const profiles = await this.store.listProfiles();
    const activeId = await this.store.getActiveProfileId();
    const autoRestart = vscode.workspace.getConfiguration('codec').get<boolean>('autoRestartOnSave', false);
    const confirmMacroDelete = vscode.workspace.getConfiguration('codec').get<boolean>('confirmMacroDelete', true);
    const confirmFrameworkRestart = vscode.workspace.getConfiguration('codec').get<boolean>('confirmFrameworkRestart', true);
    const forcedProduct = vscode.workspace.getConfiguration('codec').get<string>('forcedProduct', 'auto');
    // Query schema status via command invocation – use commands to avoid tight coupling.
    const status = await vscode.commands.executeCommand('ciscoCodec.getSchemaStatus');
    const knownProducts = await vscode.commands.executeCommand('ciscoCodec.getKnownProducts');
    this.panel.webview.postMessage({ type: 'state', profiles, activeId, autoRestart, schemaStatus: status, confirmMacroDelete, confirmFrameworkRestart, forcedProduct, knownProducts });
  }

  private renderHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); }
    h2 { margin: 0 0 12px 0; }
    .toolbar { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
    .toolbar .left, .toolbar .right { display: flex; gap: 8px; align-items: center; }
    .toolbar input[type="text"], .toolbar input[type="password"] { width: 160px; }
    .toolbar button { cursor: pointer; }

    table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
    thead th { position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 1; }
    th, td { border-bottom: 1px solid var(--vscode-editorGroup-border); padding: 8px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
    th { text-align: left; }
    tbody tr:hover { background: var(--vscode-list-hoverBackground); }
    tr.active { background: var(--vscode-list-inactiveSelectionBackground); }
    .col-active { width: 72px; }
    th.col-active, td.col-active { text-align: center; }
    .col-actions { width: 260px; }
    .actions button { margin-right: 6px; }
    .muted { opacity: 0.8; }
    .sort { cursor: pointer; user-select: none; }
    .sort .arrow { margin-left: 6px; opacity: 0.8; }
    .inputs-inline input { height: 24px; }
    .section { margin-top: 12px; }
    .schemaBox { border: 1px solid var(--vscode-editorGroup-border); padding: 8px; border-radius: 4px; }
    .schemaRow { display:flex; gap:8px; align-items:center; justify-content: space-between; }
    .schemaMeta { opacity: 0.8; font-size: 12px; }
  </style>
  <script>
    const vscode = acquireVsCodeApi();

    let state = { profiles: [], activeId: '' };
    let autoRestart = false;
    let schemaStatus = { loaded: false, rootKeys: 0, cachedNodes: 0, lastUpdatedMs: null, error: null, activeProduct: null };
    let confirmMacroDelete = true;
    let confirmFrameworkRestart = true;
    let forcedProduct = 'auto';
    let knownProducts = [];
    let ui = { filter: '', sortKey: 'label', sortDir: 'asc' };
    const editing = new Set();
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'state') {
        state = { profiles: msg.profiles, activeId: msg.activeId };
        autoRestart = !!msg.autoRestart;
        schemaStatus = msg.schemaStatus || schemaStatus;
        confirmMacroDelete = !!msg.confirmMacroDelete;
        confirmFrameworkRestart = !!msg.confirmFrameworkRestart;
        forcedProduct = msg.forcedProduct || 'auto';
        knownProducts = Array.isArray(msg.knownProducts) ? msg.knownProducts : [];
        render();
      }
    });
    window.addEventListener('load', () => {
      const addBtn = document.getElementById('addBtn');
      if (addBtn) addBtn.addEventListener('click', add);
      const filter = document.getElementById('filter');
      if (filter) filter.addEventListener('input', (e) => { ui.filter = e.target.value; render(); });
      const inputs = document.querySelectorAll('#label, #host, #username, #password');
      inputs.forEach((el) => el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') add(); }));
      const chk = document.getElementById('autoRestart');
      if (chk) chk.addEventListener('change', (e) => {
        vscode.postMessage({ type: 'setAutoRestart', value: e.target.checked });
      });
      const delChk = document.getElementById('confirmMacroDelete');
      if (delChk) delChk.addEventListener('change', (e) => {
        vscode.postMessage({ type: 'setConfirmMacroDelete', value: e.target.checked });
      });
      const fwChk = document.getElementById('confirmFrameworkRestart');
      if (fwChk) fwChk.addEventListener('change', (e) => {
        vscode.postMessage({ type: 'setConfirmFrameworkRestart', value: e.target.checked });
      });
      const productSelect = document.getElementById('forcedProduct');
      if (productSelect) productSelect.addEventListener('change', (e) => {
        const val = e.target.value || 'auto';
        vscode.postMessage({ type: 'setForcedProduct', value: val });
      });
    });
    function add() {
      const label = document.getElementById('label').value;
      const host = document.getElementById('host').value;
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      if (!label || !host || !username || !password) { return; }
      vscode.postMessage({ type: 'add', label, host, username, password });
      document.getElementById('password').value = '';
    }
    function setActive(id) { vscode.postMessage({ type: 'setActive', id }); }
    function del(id) { vscode.postMessage({ type: 'delete', id }); }
    function edit(id) {
      const p = state.profiles.find(p => p.id === id);
      if (!p) return;
      editing.add(id);
      render();
    }
    function toggleSort(key) {
      if (ui.sortKey === key) {
        ui.sortDir = ui.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        ui.sortKey = key; ui.sortDir = 'asc';
      }
      render();
    }
    function getFilteredSorted() {
      const f = (ui.filter || '').toLowerCase();
      const filtered = state.profiles.filter(p =>
        p.label.toLowerCase().includes(f) || p.host.toLowerCase().includes(f) || p.username.toLowerCase().includes(f)
      );
      const dir = ui.sortDir === 'asc' ? 1 : -1;
      const key = ui.sortKey;
      return filtered.sort((a, b) => {
        if (key === 'active') {
          const av = state.activeId === a.id ? 1 : 0;
          const bv = state.activeId === b.id ? 1 : 0;
          return (av - bv) * dir;
        }
        const av = String(a[key] || '').toLowerCase();
        const bv = String(b[key] || '').toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      });
    }
    function render() {
      const tbody = document.getElementById('tbody');
      tbody.innerHTML = '';
      const chk = document.getElementById('autoRestart');
      if (chk) chk.checked = !!autoRestart;
      const delChk = document.getElementById('confirmMacroDelete');
      if (delChk) delChk.checked = !!confirmMacroDelete;
      const fwChk = document.getElementById('confirmFrameworkRestart');
      if (fwChk) fwChk.checked = !!confirmFrameworkRestart;
      const schemaLoaded = document.getElementById('schemaLoaded');
      const schemaMeta = document.getElementById('schemaMeta');
      if (schemaLoaded) schemaLoaded.textContent = schemaStatus.loaded ? 'Loaded' : 'Not loaded';
      if (schemaMeta) {
        const d = schemaStatus.lastUpdatedMs ? new Date(schemaStatus.lastUpdatedMs).toLocaleString() : '—';
        const err = schemaStatus.error ? (' · error: ' + schemaStatus.error) : '';
        schemaMeta.textContent = 'root keys: ' + schemaStatus.rootKeys + ' · cached nodes: ' + schemaStatus.cachedNodes + ' · updated: ' + d + err;
      }
      const productSelect = document.getElementById('forcedProduct');
      if (productSelect) {
        productSelect.innerHTML = '';
        const optAuto = document.createElement('option'); optAuto.value = 'auto'; optAuto.textContent = 'Auto';
        productSelect.appendChild(optAuto);
        for (const p of knownProducts) {
          const opt = document.createElement('option');
          opt.value = p.code; opt.textContent = p.label + ' (' + p.code + ')';
          productSelect.appendChild(opt);
        }
        productSelect.value = forcedProduct || 'auto';
      }
      const rows = getFilteredSorted();
      for (const p of rows) {
        const tr = document.createElement('tr');
        if (state.activeId === p.id) tr.className = 'active';
        const tdActive = document.createElement('td'); tdActive.className = 'col-active';
        const tdLabel = document.createElement('td');
        const tdHost = document.createElement('td');
        const tdUser = document.createElement('td');
        const tdActions = document.createElement('td'); tdActions.className = 'actions col-actions';

        if (editing.has(p.id)) {
          // Editable inputs
          const inLabel = document.createElement('input'); inLabel.value = p.label; inLabel.size = 16;
          const inHost = document.createElement('input'); inHost.value = p.host; inHost.size = 16;
          const inUser = document.createElement('input'); inUser.value = p.username; inUser.size = 12;
          const inPass = document.createElement('input'); inPass.type = 'password'; inPass.placeholder = 'Leave blank to keep'; inPass.size = 16;
          [inLabel, inHost, inUser, inPass].forEach(el => el.classList.add('inputs-inline'));
          const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'active'; radio.checked = state.activeId === p.id; radio.disabled = true; radio.title = 'Active profile';
          tdActive.appendChild(radio);
          tdLabel.appendChild(inLabel);
          tdHost.appendChild(inHost);
          tdUser.appendChild(inUser);

          const btnSave = document.createElement('button'); btnSave.textContent = 'Save';
          btnSave.addEventListener('click', () => {
            const updates = { label: inLabel.value, host: inHost.value, username: inUser.value };
            const password = inPass.value === '' ? undefined : inPass.value;
            vscode.postMessage({ type: 'update', originalId: p.id, updates, password });
            editing.delete(p.id);
          });
          const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancel';
          btnCancel.addEventListener('click', () => { editing.delete(p.id); render(); });
          tdActions.appendChild(inPass);
          tdActions.appendChild(btnSave);
          tdActions.appendChild(btnCancel);
        } else {
          // Readonly row
          const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'active'; radio.checked = state.activeId === p.id; radio.title = 'Set Active';
          radio.addEventListener('change', () => setActive(p.id));
          tdActive.appendChild(radio);
          tdLabel.textContent = p.label;
          tdHost.textContent = p.host;
          tdUser.textContent = p.username;
          const btnEdit = document.createElement('button'); btnEdit.textContent = 'Edit'; btnEdit.addEventListener('click', () => { editing.add(p.id); render(); });
          const btnDel = document.createElement('button'); btnDel.textContent = 'Delete'; btnDel.addEventListener('click', () => del(p.id));
          tdActions.appendChild(btnEdit); tdActions.appendChild(btnDel);
        }

        tr.appendChild(tdActive); tr.appendChild(tdLabel); tr.appendChild(tdHost); tr.appendChild(tdUser); tr.appendChild(tdActions);
        tbody.appendChild(tr);
      }

      // Update header arrows
      const heads = document.querySelectorAll('th.sort');
      heads.forEach((th) => {
        const key = th.getAttribute('data-key');
        const arrow = th.querySelector('.arrow');
        if (!arrow) return;
        if (ui.sortKey === key) {
          arrow.textContent = ui.sortDir === 'asc' ? '▲' : '▼';
          th.classList.remove('muted');
        } else {
          arrow.textContent = '';
          th.classList.add('muted');
        }
      });
    }
  </script>
</head>
<body>
  <h2>Settings</h2>
  <div class="section">
    <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
      <input id="autoRestart" type="checkbox" />
      Automatically restart macro framework when saving a macro
    </label>
    <br/>
    <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
      <input id="confirmMacroDelete" type="checkbox" /> Confirm before deleting a macro
    </label>
    <br/>
    <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
      <input id="confirmFrameworkRestart" type="checkbox" /> Confirm before restarting Macro Framework
    </label>
  </div>
  <div class="section">
    <h2>Schema</h2>
    <div class="schemaBox">
      <div class="schemaRow">
        <div><strong>Status:</strong> <span id="schemaLoaded">—</span></div>
        <div class="schemaMeta" id="schemaMeta"></div>
        <div style="display:flex;gap:8px;">
          <button onclick="vscode.postMessage({type:'refreshSchema'})">Refresh</button>
          <button onclick="vscode.postMessage({type:'showSchemaJson'})">View JSON</button>
        </div>
      </div>
      <div class="schemaRow" style="margin-top:8px;">
        <div><strong>Product:</strong></div>
        <div style="flex:1"></div>
        <select id="forcedProduct" style="min-width:260px"></select>
      </div>
    </div>
  </div>
  <h2>Directory</h2>
  <div class="toolbar">
    <div class="left">
      <input id="label" placeholder="Label" type="text" />
      <input id="host" placeholder="Host" type="text" />
      <input id="username" placeholder="Username" value="admin" type="text" />
      <input id="password" placeholder="Password" type="password" />
      <button id="addBtn">Add</button>
    </div>
    <div class="right">
      <input id="filter" placeholder="Filter profiles" type="text" />
    </div>
  </div>
  <table>
    <colgroup>
      <col class="col-active" />
      <col class="col-label" />
      <col class="col-host" />
      <col class="col-user" />
      <col class="col-actions" />
    </colgroup>
    <thead>
      <tr>
        <th class="col-active sort muted" data-key="active" onclick="toggleSort('active')">Active <span class="arrow"></span></th>
        <th class="col-label sort" data-key="label" onclick="toggleSort('label')">Label <span class="arrow"></span></th>
        <th class="col-host sort" data-key="host" onclick="toggleSort('host')">Host <span class="arrow"></span></th>
        <th class="col-user sort" data-key="username" onclick="toggleSort('username')">Username <span class="arrow"></span></th>
        <th class="col-actions"></th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>
  <div class="section" style="margin-top:16px;">
    <h2>Disclaimer</h2>
    <div class="schemaBox">
      <div class="schemaRow" style="justify-content: flex-start;">
        <div class="schemaMeta" style="max-width: 900px;">
          This project is under active development and provided “as is”, without warranty of any kind. The author assumes no responsibility for any outcomes arising from the use of this software. Use at your own risk and test changes in non‑production environments first.
          <div style="margin-top:8px;">
            Potential consequences include (but are not limited to):
            <ul style="margin:6px 0 0 18px;">
              <li>Loss of data</li>
              <li>Loss of hair</li>
              <li>Loss of enjoyment</li>
              <li>Fire in the engine room</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}


