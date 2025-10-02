/* global acquireVsCodeApi */

/** @typedef {{ id:string,label:string,host:string,username:string,connectionMethod:'ssh'|'wss' }} Profile */
/** @typedef {{ code:string,label:string }} KnownProduct */

const vscode = acquireVsCodeApi();

let state = /** @type {{ profiles: Profile[], activeId?: string }} */ ({ profiles: [], activeId: undefined });
let autoRestart = false;
let autoRestartOnActivateDeactivate = false;
let applySchema = true;
let schemaStatus = { loaded: false, rootKeys: 0, cachedNodes: 0, lastUpdatedMs: null, error: null, activeProduct: null };
let confirmMacroDelete = true;
let confirmFrameworkRestart = true;
let forcedProduct = 'auto';
let knownProducts = /** @type {KnownProduct[]} */ ([]);

let ui = { filter: '', sortKey: 'label', sortDir: 'asc' };
const editing = new Set();

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg && msg.type === 'state') {
    state = { profiles: Array.isArray(msg.profiles) ? msg.profiles : [], activeId: msg.activeId };
    autoRestart = !!msg.autoRestart;
    autoRestartOnActivateDeactivate = !!msg.autoRestartOnActivateDeactivate;
    applySchema = !!msg.applySchema;
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
  if (filter) filter.addEventListener('input', debounce((e) => { ui.filter = e.target.value; render(); }, 120));

  ['autoRestart','autoRestartOnActivateDeactivate','applySchema','confirmMacroDelete','confirmFrameworkRestart']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', (e) => {
        const value = !!e.target.checked;
        const map = {
          autoRestart: 'setAutoRestart',
          autoRestartOnActivateDeactivate: 'setAutoRestartOnActivateDeactivate',
          applySchema: 'setApplySchema',
          confirmMacroDelete: 'setConfirmMacroDelete',
          confirmFrameworkRestart: 'setConfirmFrameworkRestart'
        };
        const type = map[id];
        if (type) vscode.postMessage({ type, value });
      });
    });

  const productSelect = document.getElementById('forcedProduct');
  if (productSelect) productSelect.addEventListener('change', (e) => {
    const val = e.target.value || 'auto';
    vscode.postMessage({ type: 'setForcedProduct', value: val });
  });

  const btnRefreshSchema = document.getElementById('btnRefreshSchema');
  if (btnRefreshSchema) btnRefreshSchema.addEventListener('click', () => vscode.postMessage({ type: 'refreshSchema' }));

  const btnShowSchemaJson = document.getElementById('btnShowSchemaJson');
  if (btnShowSchemaJson) btnShowSchemaJson.addEventListener('click', () => vscode.postMessage({ type: 'showSchemaJson' }));
});

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function add() {
  const label = document.getElementById('label').value;
  const host = document.getElementById('host').value;
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const connectionMethod = document.getElementById('connectionMethod').value || 'wss';
  if (!label || !host || !username || !password) { return; }
  vscode.postMessage({ type: 'add', label, host, username, password, connectionMethod });
  document.getElementById('password').value = '';
}

function setActive(id) { vscode.postMessage({ type: 'setActive', id }); }
function delProfile(id) { vscode.postMessage({ type: 'delete', id }); }

function toggleSort(key) {
  if (ui.sortKey === key) { ui.sortDir = ui.sortDir === 'asc' ? 'desc' : 'asc'; }
  else { ui.sortKey = key; ui.sortDir = 'asc'; }
  render();
}

function getFilteredSorted() {
  const f = (ui.filter || '').toLowerCase();
  const filtered = state.profiles.filter(p =>
    p.label.toLowerCase().includes(f) || p.host.toLowerCase().includes(f) || p.username.toLowerCase().includes(f)
  );
  const dir = ui.sortDir === 'asc' ? 1 : -1;
  const key = ui.sortKey;
  const withIndex = filtered.map((item, index) => ({ item, index }));
  withIndex.sort((a, b) => {
    if (key === 'active') {
      const av = state.activeId === a.item.id ? 1 : 0;
      const bv = state.activeId === b.item.id ? 1 : 0;
      const cmp = (av - bv) * dir;
      return cmp !== 0 ? cmp : a.index - b.index;
    }
    const av = String(a.item[key] || '').toLowerCase();
    const bv = String(b.item[key] || '').toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.index - b.index;
  });
  return withIndex.map(x => x.item);
}

function render() {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';

  const chk = document.getElementById('autoRestart');
  if (chk) chk.checked = !!autoRestart;
  const chk2 = document.getElementById('autoRestartOnActivateDeactivate');
  if (chk2) chk2.checked = !!autoRestartOnActivateDeactivate;
  const applySchemaChk = document.getElementById('applySchema');
  if (applySchemaChk) applySchemaChk.checked = !!applySchema;
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
  const tdMethod = document.createElement('td');

    if (editing.has(p.id)) {
      const inLabel = document.createElement('input'); inLabel.value = p.label; inLabel.size = 16;
      const inHost = document.createElement('input'); inHost.value = p.host; inHost.size = 16;
      const inUser = document.createElement('input'); inUser.value = p.username; inUser.size = 12;
  const inPass = document.createElement('input'); inPass.type = 'password'; inPass.placeholder = 'Leave blank to keep'; inPass.size = 16;
  const selMethod = document.createElement('select');
  ['ssh','wss'].forEach(m => { const opt=document.createElement('option'); opt.value=m; opt.textContent=m.toUpperCase(); if((p.connectionMethod||'ssh')===m) opt.selected=true; selMethod.appendChild(opt); });
      [inLabel, inHost, inUser, inPass].forEach(el => el.classList.add('inputs-inline'));
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'active'; radio.checked = state.activeId === p.id; radio.disabled = true; radio.title = 'Active profile';
      tdActive.appendChild(radio);
      tdLabel.appendChild(inLabel);
      tdHost.appendChild(inHost);
  tdUser.appendChild(inUser);
  tdMethod.appendChild(selMethod);

      const btnSave = document.createElement('button'); btnSave.textContent = 'Save';
      btnSave.addEventListener('click', () => {
        const updates = { label: inLabel.value, host: inHost.value, username: inUser.value, connectionMethod: selMethod.value };
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
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'active'; radio.checked = state.activeId === p.id; radio.title = 'Set Active';
      radio.addEventListener('change', () => setActive(p.id));
      tdActive.appendChild(radio);
      tdLabel.textContent = p.label;
      tdHost.textContent = p.host;
  tdUser.textContent = p.username;
  // Indicate effective method; SSH is currently treated as WSS
  const effective = (p.connectionMethod || 'wss').toUpperCase();
  tdMethod.textContent = effective + ((p.connectionMethod === 'ssh') ? ' (WSS enforced)' : '');
      const btnEdit = document.createElement('button'); btnEdit.textContent = 'Edit'; btnEdit.addEventListener('click', () => { editing.add(p.id); render(); });
      const btnDel = document.createElement('button'); btnDel.textContent = 'Delete'; btnDel.addEventListener('click', () => delProfile(p.id));
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnDel);
    }

  tr.appendChild(tdActive); tr.appendChild(tdLabel); tr.appendChild(tdHost); tr.appendChild(tdUser); tr.appendChild(tdMethod); tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }

  // header sort arrows
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
    th.onclick = () => toggleSort(key);
  });
}


