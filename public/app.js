// Barcode Audit PWA - Main Application
const API_URL = '';
let currentUser = null;
let currentAudit = null;
let html5QrCode = null;
let scannerMode = 'station'; // 'station' or 'item'

const LIST_END = `<div class="list-end-marker">— End of list —</div>`;

function localISOString() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ==================== AUTH ====================

function init() {
  updateOnlineStatus();
  const token = localStorage.getItem('token');
  if (token) {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    showMainScreen();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-screen').classList.add('hidden');
}

function showMainScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser.username;
  
  // Reset all admin-only elements first
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.add('hidden');
    el.style.display = 'none';
  });
  
  if (currentUser.role === 'admin') {
    // Show admin elements for admin users
    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.remove('hidden');
      el.style.display = '';
    });
  }
  
  loadAuditScreen();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      currentUser = data.user;
      showMainScreen();
      showToast('Login successful!', 'success');
    } else {
      document.getElementById('login-error').textContent = data.error || 'Login failed';
    }
  } catch (err) {
    document.getElementById('login-error').textContent = 'Network error';
  }
});

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  showLoginScreen();
}

// ==================== API HELPERS ====================

async function apiGet(endpoint) {
  const token = localStorage.getItem('token');
  const res = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

async function apiPost(endpoint, data) {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  } catch (err) {
    if (!navigator.onLine) {
      enqueueWrite('POST', endpoint, data);
      throw new Error('Saved offline — will sync when reconnected');
    }
    throw err;
  }
}

async function apiPut(endpoint, data) {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  } catch (err) {
    if (!navigator.onLine) {
      enqueueWrite('PUT', endpoint, data);
      throw new Error('Saved offline — will sync when reconnected');
    }
    throw err;
  }
}

async function apiDelete(endpoint) {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  } catch (err) {
    if (!navigator.onLine) {
      enqueueWrite('DELETE', endpoint, null);
      throw new Error('Saved offline — will sync when reconnected');
    }
    throw err;
  }
}

// ==================== NAVIGATION ====================

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const screen = tab.dataset.screen;
    document.querySelectorAll('.content-screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${screen}-screen`).classList.remove('hidden');
    
    if (screen === 'audit') loadAuditScreen();
    if (screen === 'reports') loadReports();
    if (screen === 'issues') loadIssuesScreen();
    if (screen === 'admin') loadAdminScreen();
  });
});

document.getElementById('menu-btn').addEventListener('click', async () => {
  document.getElementById('account-username').textContent = currentUser.username;
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-error').classList.add('hidden');
  document.getElementById('account-modal').classList.remove('hidden');
  try {
    const v = await apiGet('/api/version');
    document.getElementById('ver-app').textContent = `v${v.app_version}`;
    document.getElementById('ver-date').textContent = v.last_modified || '—';
    document.getElementById('ver-db').textContent = v.db_last_updated ? v.db_last_updated.slice(0, 16) : '—';
  } catch (e) { /* version info optional */ }
});

document.getElementById('account-logout-btn').addEventListener('click', () => {
  document.getElementById('account-modal').classList.add('hidden');
  logout();
});

document.getElementById('change-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = document.getElementById('cp-current').value;
  const newPw = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  const errorEl = document.getElementById('cp-error');

  if (newPw !== confirm) {
    errorEl.textContent = 'New passwords do not match';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await apiPut('/api/auth/change-password', { current_password: current, new_password: newPw });
    if (res.error) {
      errorEl.textContent = res.error;
      errorEl.classList.remove('hidden');
      return;
    }
    document.getElementById('account-modal').classList.add('hidden');
    showToast('Password updated successfully!', 'success');
  } catch (err) {
    errorEl.textContent = 'Failed to update password';
    errorEl.classList.remove('hidden');
  }
});

// ==================== AUDIT SCREEN ====================

function loadAuditScreen() {
  document.getElementById('audit-welcome').classList.remove('hidden');
  document.getElementById('audit-active').classList.add('hidden');
  currentAudit = null;
}

document.getElementById('scan-station-btn').addEventListener('click', () => {
  scannerMode = 'station';
  openScanner('Scan Station Barcode');
});

document.getElementById('scan-item-btn').addEventListener('click', () => {
  scannerMode = 'item';
  openScanner('Scan Item Barcode');
});

document.getElementById('finish-audit-btn').addEventListener('click', finishAudit);
document.getElementById('cancel-audit-btn').addEventListener('click', () => {
  if (confirm('Cancel this audit?')) loadAuditScreen();
});
document.getElementById('cancel-audit-btn-2').addEventListener('click', () => {
  if (confirm('Cancel this audit?')) loadAuditScreen();
});
document.getElementById('done-scanning-btn').addEventListener('click', showSubmitPhase);
document.getElementById('resume-scanning-btn').addEventListener('click', showScanPhase);

function showSubmitPhase() {
  document.getElementById('scanning-actions').classList.add('hidden');
  document.getElementById('submit-actions').classList.remove('hidden');
}

function showScanPhase() {
  document.getElementById('submit-actions').classList.add('hidden');
  document.getElementById('scanning-actions').classList.remove('hidden');
}

// Station search
document.getElementById('station-search-input').addEventListener('input', async (e) => {
  const query = e.target.value.toLowerCase();
  if (query.length < 2) {
    document.getElementById('station-search-results').innerHTML = '';
    return;
  }
  
  try {
    const stations = await apiGet('/api/stations');
    const filtered = stations.filter(s => s.name.toLowerCase().includes(query));
    
    document.getElementById('station-search-results').innerHTML = filtered.map(s => `
      <div class="search-result-item" data-id="${s.station_id}" data-name="${s.name}" data-location="${s.location || ''}">
        <strong>${s.name}</strong> - ${s.location || 'No location'}
      </div>
    `).join('');
    
    document.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => startAudit({
        station_id: item.dataset.id,
        name: item.dataset.name,
        location: item.dataset.location
      }));
    });
  } catch (err) {
    console.error(err);
  }
});

async function startAudit(station) {
  try {
    let result = await apiPost('/api/audits', { station_id: station.station_id, start_time: localISOString() });

    // If an audit is already in progress for this station, resume it
    if (result.error && result.error.includes('already in progress')) {
      const active = await apiGet('/api/audits/active');
      const existing = active.find(a => a.station_id == station.station_id);
      if (existing) {
        result = existing;
        showToast('Resuming existing audit', 'info');
      } else {
        showToast(result.error, 'error');
        return;
      }
    } else if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    currentAudit = {
      audit_id: result.audit_id,
      station: station,
      start_time: new Date(),
      items: [],
      expectedItems: []
    };

    // Reload already-scanned items if resuming
    const auditDetails = await apiGet(`/api/audits/${result.audit_id}`);
    if (auditDetails.details && auditDetails.details.length) {
      currentAudit.items = auditDetails.details.map(d => ({
        item_id: d.item_id,
        status: d.status,
        notes: d.notes,
        condition: d.condition,
        sub_location_id: d.sub_location_id,
        action: d.action
      }));
    }

    document.getElementById('audit-welcome').classList.add('hidden');
    document.getElementById('audit-active').classList.remove('hidden');
    document.getElementById('audit-station-name').textContent = station.name;
    document.getElementById('audit-station-location').textContent = station.location || '';

    showScanPhase();
    document.getElementById('audit-start-time').textContent = currentAudit.start_time.toLocaleString();

    const stationItems = await apiGet(`/api/distribution/station/${station.station_id}`);
    // Keep ALL distribution entries — same item can be at multiple sub-locations
    currentAudit.expectedItems = Array.isArray(stationItems) ? stationItems : [];
    renderItemChecklist();
    updateAuditStats();
    showToast('Audit started!', 'success');
  } catch (err) {
    showToast('Failed to start audit', 'error');
  }
}

async function handleBarcodeScan(barcode) {
  closeScanner();

  if (scannerMode === 'station') {
    try {
      const station = await apiGet(`/api/stations/barcode/${barcode}`);
      if (station.error) { showToast('Station not found', 'error'); return; }
      startAudit(station);
    } catch (err) {
      showToast('Error looking up station', 'error');
    }
  } else if (scannerMode === 'item' && currentAudit) {
    try {
      const item = await apiGet(`/api/items/barcode/${barcode}`);
      if (item.error) { showToast('Item not found', 'error'); return; }

      const matchingEntries = currentAudit.expectedItems.filter(ei => ei.item_id == item.item_id);

      if (matchingEntries.length > 0) {
        // Item belongs to this station — ask for condition (and sub-location if multiple)
        const subLocations = matchingEntries
          .filter(e => e.sub_location_id != null)
          .map(e => ({ sub_location_id: e.sub_location_id, name: e.sub_location_name || 'Sub-location' }));
        showConditionModal(item, subLocations, matchingEntries);
      } else {
        // Item not assigned here — show misplaced action options
        showMisplacedActionsModal(item);
      }
    } catch (err) {
      showToast('Error looking up item', 'error');
    }
  }
}

function populateItemInfoInModal(item) {
  document.getElementById('status-item-name').textContent = item.item_name;
  const barcodeDisplay = document.getElementById('status-item-barcode');
  if (item.barcode) {
    barcodeDisplay.innerHTML = `<div class="barcode-display">*${item.barcode}*</div><div class="barcode-label">${item.barcode}</div>`;
  } else {
    barcodeDisplay.textContent = 'Barcode: N/A';
  }
}

function showConditionModal(item, subLocations, matchingEntries) {
  const modal = document.getElementById('status-modal');
  modal.dataset.itemId = item.item_id;
  modal.dataset.mode = 'condition';
  modal.dataset.selectedCondition = '';

  populateItemInfoInModal(item);
  document.getElementById('status-modal-title').textContent = 'Item Condition';

  const subLocGroup = document.getElementById('condition-subloc-group');
  const subLocSelect = document.getElementById('condition-subloc-select');

  if (subLocations.length > 1) {
    subLocSelect.innerHTML = subLocations.map(sl =>
      `<option value="${sl.sub_location_id}">${sl.name}</option>`
    ).join('');
    modal.dataset.selectedSubLoc = subLocations[0].sub_location_id;
    subLocGroup.classList.remove('hidden');
  } else if (subLocations.length === 1) {
    modal.dataset.selectedSubLoc = subLocations[0].sub_location_id;
    subLocGroup.classList.add('hidden');
  } else {
    modal.dataset.selectedSubLoc = '';
    subLocGroup.classList.add('hidden');
  }

  document.querySelectorAll('.condition-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('confirm-condition-btn').disabled = true;
  document.getElementById('condition-mode').classList.remove('hidden');
  document.getElementById('misplaced-mode').classList.add('hidden');
  modal.classList.remove('hidden');
}

function showMisplacedActionsModal(item) {
  const modal = document.getElementById('status-modal');
  modal.dataset.itemId = item.item_id;
  modal.dataset.mode = 'misplaced';

  populateItemInfoInModal(item);
  document.getElementById('status-modal-title').textContent = 'Item Not Listed Here';
  document.getElementById('condition-mode').classList.add('hidden');
  document.getElementById('misplaced-mode').classList.remove('hidden');
  modal.classList.remove('hidden');
}

document.getElementById('condition-subloc-select').addEventListener('change', (e) => {
  document.getElementById('status-modal').dataset.selectedSubLoc = e.target.value;
});

document.querySelectorAll('.condition-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.manualStatus) return; // handled separately
    document.querySelectorAll('.condition-btn:not([data-manual-status])').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const modal = document.getElementById('status-modal');
    modal.dataset.selectedCondition = btn.dataset.condition;
    // In manual mode, only enable if status is also selected
    if (modal.dataset.mode === 'manual') {
      document.getElementById('confirm-condition-btn').disabled = !modal.dataset.selectedStatus;
    } else {
      document.getElementById('confirm-condition-btn').disabled = false;
    }
  });
});

document.getElementById('confirm-condition-btn').addEventListener('click', async () => {
  const modal = document.getElementById('status-modal');
  const itemId = modal.dataset.itemId;
  const condition = modal.dataset.selectedCondition || null;
  const subLocId = modal.dataset.selectedSubLoc ? parseInt(modal.dataset.selectedSubLoc) : null;
  const mode = modal.dataset.mode;

  try {
    if (mode === 'manual') {
      const status = modal.dataset.selectedStatus;
      if (!status) { showToast('Please select a status', 'warning'); return; }
      await recordItemStatus(itemId, status, '', status === 'Found' ? condition : null, subLocId, null);
      updateItemRow(itemId, status, status === 'Found' ? condition : null, subLocId);
      closeStatusModal();
      showToast(status === 'Found' ? `Confirmed — ${condition || 'no condition'}` : 'Marked as Missing', status === 'Found' ? 'success' : 'warning');
    } else {
      await recordItemStatus(itemId, 'Found', '', condition, subLocId, null);
      updateItemRow(itemId, 'Found', condition, subLocId);
      closeStatusModal();
      showToast(`Confirmed — ${condition}`, 'success');
    }
  } catch (err) {
    showToast('Failed to record item', 'error');
  }
});

document.querySelectorAll('.misplaced-action-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const modal = document.getElementById('status-modal');
    const itemId = modal.dataset.itemId;
    const action = btn.dataset.action;
    try {
      await recordItemStatus(itemId, 'Misplaced', '', null, null, action);
      closeStatusModal();
      updateAuditStats();
      showToast('Action recorded', 'success');
    } catch (err) {
      showToast('Failed to record action', 'error');
    }
  });
});

function updateAuditStats() {
  const found = currentAudit.items.filter(i => i.status === 'Found').length;
  const missing = currentAudit.items.filter(i => i.status === 'Missing').length;
  const misplaced = currentAudit.items.filter(i => i.status === 'Misplaced').length;
  const confirmed = found + missing + misplaced;
  const total = currentAudit.expectedItems ? currentAudit.expectedItems.length : 0;

  document.getElementById('count-found').textContent = found;
  document.getElementById('count-missing').textContent = missing;
  document.getElementById('count-misplaced').textContent = misplaced;

  if (total > 0) {
    document.getElementById('items-count').textContent = `${confirmed} / ${total} confirmed`;
  }
}

function renderItemChecklist() {
  const list = document.getElementById('audit-items-list');
  const countEl = document.getElementById('items-count');

  if (!currentAudit.expectedItems || currentAudit.expectedItems.length === 0) {
    list.innerHTML = '<p class="empty-state">No items assigned to this station.</p>';
    countEl.textContent = '0 items';
    return;
  }

  countEl.textContent = `0 / ${currentAudit.expectedItems.length} confirmed`;

  list.innerHTML = currentAudit.expectedItems.map(item => {
    const rowKey = `${item.item_id}_${item.sub_location_id || 0}`;
    const scanned = currentAudit.items.find(i =>
      i.item_id == item.item_id && (i.sub_location_id || 0) == (item.sub_location_id || 0)
    );
    const condHtml = scanned && scanned.condition
      ? `<span class="condition-badge cond-${scanned.condition.toLowerCase()}">${scanned.condition}</span>`
      : '';
    const subLocHtml = item.sub_location_name
      ? `<span class="subloc-tag">${item.sub_location_name}</span>` : '';
    const rowClass = scanned ? `row-${scanned.status.toLowerCase()}` : '';
    const noBarcode = !item.barcode;
    const tapAttr = noBarcode && !scanned ? `onclick="showManualItemModal(${item.item_id},${item.sub_location_id||'null'},'${item.item_name.replace(/'/g,"\\'")}',${item.sub_location_id||'null'})" style="cursor:pointer"` : '';
    return `
      <div class="checklist-item ${rowClass}${noBarcode && !scanned ? ' item-no-barcode' : ''}" id="item-row-${rowKey}" ${tapAttr}>
        <div id="item-icon-${rowKey}" class="item-check-icon">
          ${scanned && scanned.status === 'Found'
            ? `<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#16a34a"/><polyline points="7 12 10 15 17 9" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : scanned && scanned.status === 'Missing'
            ? `<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#dc2626"/><line x1="8" y1="8" x2="16" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`
            : noBarcode
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" width="32" height="32"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" stroke-width="2"/><circle cx="12" cy="16" r="1" fill="#f59e0b"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" stroke-width="1.5" width="32" height="32"><circle cx="12" cy="12" r="10"/></svg>`
          }
        </div>
        <div class="checklist-item-info">
          <div class="checklist-item-name">${item.item_name} ${subLocHtml}</div>
          <div class="checklist-item-barcode">${item.barcode || '<em style="color:var(--warning)">No barcode — tap to update</em>'}</div>
        </div>
        <div id="item-cond-${rowKey}" class="item-condition-slot">${condHtml}</div>
      </div>
    `;
  }).join('') + LIST_END;
}

function showManualItemModal(itemId, subLocationId, itemName) {
  const modal = document.getElementById('status-modal');
  modal.dataset.itemId = itemId;
  modal.dataset.mode = 'manual';
  modal.dataset.selectedCondition = '';
  modal.dataset.selectedSubLoc = subLocationId || '';
  modal.dataset.selectedStatus = '';

  document.getElementById('status-modal-title').textContent = 'Update Item Status';
  document.getElementById('status-item-name').textContent = itemName;
  document.getElementById('status-item-barcode').textContent = 'No barcode — manual entry';

  document.getElementById('condition-subloc-group').classList.add('hidden');
  document.getElementById('condition-mode').classList.remove('hidden');
  document.getElementById('misplaced-mode').classList.add('hidden');

  // Swap confirm button label and add Found/Missing toggle above condition
  const confirmBtn = document.getElementById('confirm-condition-btn');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.disabled = true;

  // Add Found/Missing toggle if not already present
  let toggleRow = document.getElementById('manual-status-toggle');
  if (!toggleRow) {
    const condSection = document.getElementById('status-modal').querySelector('.condition-section');
    toggleRow = document.createElement('div');
    toggleRow.id = 'manual-status-toggle';
    toggleRow.className = 'condition-section';
    toggleRow.innerHTML = `
      <p class="condition-label">Status</p>
      <div class="condition-btn-row">
        <button class="condition-btn cond-good" data-manual-status="Found">Found</button>
        <button class="condition-btn cond-bad" data-manual-status="Missing">Missing</button>
      </div>`;
    condSection.parentNode.insertBefore(toggleRow, condSection);
  } else {
    toggleRow.classList.remove('hidden');
    toggleRow.querySelectorAll('[data-manual-status]').forEach(b => b.classList.remove('selected'));
  }

  document.querySelectorAll('.condition-btn').forEach(b => b.classList.remove('selected'));
  modal.classList.remove('hidden');
}

document.getElementById('status-modal').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-manual-status]');
  if (!btn) return;
  const modal = document.getElementById('status-modal');
  if (modal.dataset.mode !== 'manual') return;
  document.querySelectorAll('[data-manual-status]').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  modal.dataset.selectedStatus = btn.dataset.manualStatus;
  const hasCond = modal.dataset.selectedCondition;
  const hasStatus = btn.dataset.manualStatus;
  document.getElementById('confirm-condition-btn').disabled = !(hasCond && hasStatus) && !(hasStatus === 'Missing');
  if (hasStatus === 'Missing') document.getElementById('confirm-condition-btn').disabled = false;
});

async function recordItemStatus(itemId, status, notes = '', condition = null, subLocationId = null, action = null) {
  await apiPost(`/api/audits/${currentAudit.audit_id}/details`, {
    item_id: itemId,
    status,
    notes,
    condition,
    sub_location_id: subLocationId,
    action,
    scan_time: localISOString()
  });

  // Match on both item_id and sub_location_id so multi-sub-loc items are tracked separately
  const idx = currentAudit.items.findIndex(i =>
    i.item_id == itemId && (i.sub_location_id || 0) == (subLocationId || 0)
  );
  if (idx >= 0) {
    Object.assign(currentAudit.items[idx], { status, notes, condition, sub_location_id: subLocationId, action });
  } else {
    currentAudit.items.push({ item_id: itemId, status, notes, condition, sub_location_id: subLocationId, action });
  }
  updateAuditStats();
}

function updateItemRow(itemId, status, condition, subLocationId = null) {
  const rowKey = `${itemId}_${subLocationId || 0}`;
  const icon = document.getElementById(`item-icon-${rowKey}`);
  const row = document.getElementById(`item-row-${rowKey}`);
  const condEl = document.getElementById(`item-cond-${rowKey}`);

  if (icon) {
    if (status === 'Found') {
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#16a34a"/><polyline points="7 12 10 15 17 9" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (status === 'Missing') {
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#dc2626"/><line x1="8" y1="8" x2="16" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    }
  }
  if (row) {
    row.classList.remove('row-found', 'row-missing', 'row-misplaced');
    row.classList.add(`row-${status.toLowerCase()}`);
  }
  if (condEl && condition) {
    condEl.innerHTML = `<span class="condition-badge cond-${condition.toLowerCase()}">${condition}</span>`;
  }

  // All expected items scanned when every distribution entry has a matching audit item
  const allScanned = currentAudit.expectedItems.every(ei =>
    currentAudit.items.some(i =>
      i.item_id == ei.item_id && (i.sub_location_id || 0) == (ei.sub_location_id || 0)
    )
  );
  if (allScanned) showSubmitPhase();
}

async function markItemMissing(itemId, itemName) {
  try {
    await recordItemStatus(itemId, 'Missing', 'Marked missing during audit');
    updateItemRow(itemId, 'Missing');
    await apiPost('/api/reports/issues', {
      title: `Missing item: ${itemName}`,
      description: `Item "${itemName}" was reported missing during audit of station "${currentAudit.station.name}" on ${new Date().toLocaleString()}.`,
      category: 'item'
    });
    showToast(`${itemName} marked as missing — admin notified`, 'warning');
  } catch (err) {
    showToast('Failed to mark item as missing', 'error');
  }
}

async function finishAudit() {
  if (!currentAudit) return;

  try {
    // Pending = distribution entries with no matching scanned item for that item+sub-location
    const pendingItems = currentAudit.expectedItems.filter(ei =>
      !currentAudit.items.some(i =>
        i.item_id == ei.item_id && (i.sub_location_id || 0) == (ei.sub_location_id || 0)
      )
    );

    for (const item of pendingItems) {
      const subLocId = item.sub_location_id || null;
      await recordItemStatus(item.item_id, 'Missing', 'Not scanned during audit', null, subLocId);
      updateItemRow(item.item_id, 'Missing', null, subLocId);
    }

    if (pendingItems.length > 0) {
      const missingNames = pendingItems.map(i => `• ${i.item_name}`).join('\n');
      await apiPost('/api/reports/issues', {
        title: `Audit complete — ${pendingItems.length} missing item(s) at ${currentAudit.station.name}`,
        description: `Audit of station "${currentAudit.station.name}" completed on ${new Date().toLocaleString()}.\n\nMissing items:\n${missingNames}`,
        category: 'item'
      });
    }

    await apiPut(`/api/audits/${currentAudit.audit_id}/finish`, { end_time: localISOString() });
    showToast(
      pendingItems.length > 0
        ? `Audit submitted — ${pendingItems.length} missing item(s) reported to admin`
        : 'Audit complete — all items found!',
      pendingItems.length > 0 ? 'warning' : 'success'
    );
    loadAuditScreen();
  } catch (err) {
    showToast('Failed to submit audit', 'error');
  }
}

// ==================== SCANNER ====================

function openScanner(title) {
  document.getElementById('scanner-title').textContent = title;
  document.getElementById('scanner-modal').classList.remove('hidden');
  document.getElementById('scanner-status').innerHTML = '<div class="status-pulse"></div><span>Initializing camera...</span>';
  
  // Check if Html5Qrcode is loaded
  if (typeof Html5Qrcode === 'undefined') {
    document.getElementById('scanner-status').innerHTML = '<span style="color: var(--danger);">Scanner library not loaded. Please check your internet connection.</span>';
    return;
  }
  
  html5QrCode = new Html5Qrcode('scanner-viewport');
  
  Html5Qrcode.getCameras().then(cameras => {
    if (cameras && cameras.length) {
      // Try to find the back camera first
      let cameraId = cameras[cameras.length - 1].id;
      const backCamera = cameras.find(c => c.label && c.label.toLowerCase().includes('back'));
      if (backCamera) {
        cameraId = backCamera.id;
      }
      
      html5QrCode.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleBarcodeScan(decodedText);
        },
        (errorMessage) => {
          // Suppress frequent scan errors
          console.log('Scan error:', errorMessage);
        }
      ).then(() => {
        document.getElementById('scanner-status').innerHTML = '<div class="status-pulse"></div><span>Point camera at barcode</span>';
      }).catch(err => {
        document.getElementById('scanner-status').innerHTML = '<span style="color: var(--danger);">Camera error: ' + err + '</span>';
        console.error('Camera start error:', err);
      });
    } else {
      document.getElementById('scanner-status').innerHTML = '<span style="color: var(--danger);">No cameras found on this device</span>';
    }
  }).catch(err => {
    document.getElementById('scanner-status').innerHTML = '<span style="color: var(--danger);">Camera access denied. Please allow camera permissions.</span>';
    console.error('Camera access error:', err);
  });
}

function closeScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
    }).catch(err => {
      console.log('Scanner stop error:', err);
      html5QrCode = null;
    });
  }
  document.getElementById('scanner-modal').classList.add('hidden');
}

function closeStatusModal() {
  document.getElementById('status-modal').classList.add('hidden');
  document.getElementById('confirm-condition-btn').textContent = 'Confirm Found';
  const toggle = document.getElementById('manual-status-toggle');
  if (toggle) toggle.classList.add('hidden');
}

document.querySelectorAll('.close-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal.id === 'scanner-modal') closeScanner();
    else if (modal.id === 'status-modal') closeStatusModal();
    else modal.classList.add('hidden');
  });
});

document.getElementById('manual-submit').addEventListener('click', () => {
  const barcode = document.getElementById('manual-barcode').value;
  if (barcode) handleBarcodeScan(barcode);
});

// ==================== REPORTS ====================

async function loadReports() {
  try {
    const audits = await apiGet('/api/audits');
    renderReports(audits);
  } catch (err) {
    showToast('Failed to load reports', 'error');
  }
}

function renderReports(audits) {
  const container = document.getElementById('reports-list');
  if (!audits || audits.length === 0) {
    container.innerHTML = '<p class="empty-state">No audits found</p>';
    return;
  }
  
  container.innerHTML = audits.map(a => `
    <div class="report-card" data-id="${a.audit_id}">
      <div class="report-header">
        <h4>${a.station_name}</h4>
        <span class="badge ${a.status}">${a.status}</span>
      </div>
      <p class="report-location">${a.location || ''}</p>
      <p class="report-time">${new Date(a.start_time).toLocaleString()}</p>
      ${a.end_time ? `<p class="report-time">Completed: ${new Date(a.end_time).toLocaleString()}</p>` : ''}
    </div>
  `).join('');
  
  document.querySelectorAll('.report-card').forEach(card => {
    card.addEventListener('click', () => loadAuditReport(card.dataset.id));
  });
}

async function loadAuditReport(auditId) {
  try {
    const report = await apiGet(`/api/reports/audits/${auditId}`);
    alert(`Audit Report\n\nStation: ${report.station_name}\nAuditor: ${report.auditor}\nFound: ${report.found_count}\nMissing: ${report.missing_count}\nMisplaced: ${report.misplaced_count}\nTotal: ${report.total_scanned}`);
  } catch (err) {
    showToast('Failed to load report', 'error');
  }
}

document.getElementById('filter-reports-btn').addEventListener('click', async () => {
  const start = document.getElementById('report-start-date').value;
  const end = document.getElementById('report-end-date').value;
  
  try {
    const reports = await apiGet(`/api/reports/summary?start_date=${start}&end_date=${end}`);
    // Show summary
    console.log(reports);
  } catch (err) {
    showToast('Filter failed', 'error');
  }
});

// ==================== ADMIN ====================

function loadAdminScreen() {
  loadStationsAdmin();
  initTabsScrollIndicator();
}

function initTabsScrollIndicator() {
  const tabs = document.getElementById('admin-tabs-scroll');
  if (!tabs) return;
  const wrap = tabs.closest('.admin-tabs-wrap');
  if (!wrap) return;
  const update = () => {
    const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4;
    wrap.classList.toggle('tabs-has-more', !atEnd && tabs.scrollWidth > tabs.clientWidth);
  };
  tabs.addEventListener('scroll', update, { passive: true });
  update();
}

document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`admin-${tab.dataset.admin}`).classList.remove('hidden');
    
    if (tab.dataset.admin === 'stations') loadStationsAdmin();
    if (tab.dataset.admin === 'sub-locations') loadSubLocationsAdmin();
    if (tab.dataset.admin === 'items') loadItemsAdmin();
    if (tab.dataset.admin === 'distribution') loadDistributionAdmin();
    if (tab.dataset.admin === 'users') loadUsersAdmin();
    if (tab.dataset.admin === 'reports') loadAdminReports();
    if (tab.dataset.admin === 'issues') loadAdminIssues();
    if (tab.dataset.admin === 'query') loadQueryPage();
    if (tab.dataset.admin === 'backups') loadBackupsAdmin();
    if (tab.dataset.admin === 'settings') loadSettings();
  });
});

// Stations Admin
async function loadStationsAdmin() {
  try {
    const stations = await apiGet('/api/stations');
    const container = document.getElementById('stations-list');
    
    container.innerHTML = stations.map(s => `
      <div class="data-item">
        <div>
          <strong>${s.name}</strong>
          <p>${s.location || ''} | Barcode: ${s.barcode || 'N/A'}</p>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteStation(${s.station_id})">Delete</button>
      </div>
    `).join('') + LIST_END;
  } catch (err) {
    showToast('Failed to load stations', 'error');
  }
}

document.getElementById('add-station-btn').addEventListener('click', () => {
  showFormModal('Add Station', [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'barcode', label: 'Barcode', type: 'text' }
  ], async (data) => {
    await apiPost('/api/stations', data);
    loadStationsAdmin();
    showToast('Station added', 'success');
  });
});

async function deleteStation(id) {
  if (!confirm('Delete this station?')) return;
  await apiDelete(`/api/stations/${id}`);
  loadStationsAdmin();
  showToast('Station deleted', 'success');
}

// Items Admin
async function loadItemsAdmin() {
  try {
    const items = await apiGet('/api/items');
    const container = document.getElementById('items-list');

    container.innerHTML = items.map(i => `
      <div class="data-item">
        <div class="data-item-info">
          <strong>${i.item_name}</strong>
          <p>Version: ${i.version || 'N/A'} | Barcode: ${i.barcode || 'N/A'}</p>
        </div>
        <div style="display:flex;gap:var(--space-2);flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="assignItemToStation(${i.item_id},'${i.item_name.replace(/'/g,"\\'")}')">Assign</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem(${i.item_id})">Delete</button>
        </div>
      </div>
    `).join('') + LIST_END;
  } catch (err) {
    showToast('Failed to load items', 'error');
  }
}

async function assignItemToStation(itemId, itemName) {
  const stations = await apiGet('/api/stations');
  const formHtml = `
    <div class="form-group">
      <label>Station</label>
      <select id="assign-station" style="padding-left:1rem">
        <option value="">— Select Station —</option>
        ${stations.map(s => `<option value="${s.station_id}">${s.name}</option>`).join('')}
      </select>
    </div>
    <div id="assign-subloc-group" class="form-group hidden">
      <label>Sub-location</label>
      <select id="assign-subloc" style="padding-left:1rem"><option value="">— None —</option></select>
    </div>
    <div class="form-group">
      <label>Version Override (optional)</label>
      <input type="text" id="assign-version" placeholder="Leave blank to use item version" style="padding-left:1rem">
    </div>
    <button type="button" id="assign-submit" class="btn btn-primary btn-block" style="margin-top:var(--space-2)">Assign</button>
  `;
  document.getElementById('form-title').textContent = `Assign "${itemName}"`;
  document.getElementById('data-form').innerHTML = formHtml;
  document.getElementById('data-form').onsubmit = null;
  buildStationSublocForm(null, 'assign-station', 'assign-subloc-group', 'assign-subloc');
  document.getElementById('assign-submit').addEventListener('click', async () => {
    const stationId = document.getElementById('assign-station').value;
    if (!stationId) { showToast('Please select a station', 'warning'); return; }
    const subLocId = document.getElementById('assign-subloc-group').classList.contains('hidden') ? null :
      document.getElementById('assign-subloc').value || null;
    const version = document.getElementById('assign-version').value || null;
    const result = await apiPost('/api/distribution', { item_id: itemId, item_name: itemName, station_id: stationId, version, sub_location_id: subLocId });
    if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
    document.getElementById('form-modal').classList.add('hidden');
    showToast(`"${itemName}" assigned`, 'success');
  });
  document.getElementById('form-modal').classList.remove('hidden');
}

document.getElementById('add-item-btn').addEventListener('click', async () => {
  const stations = await apiGet('/api/stations');
  showFormModal('Add Item', [
    { name: 'item_name', label: 'Item Name', type: 'text', required: true },
    { name: 'version', label: 'Version', type: 'text' },
    { name: 'effective_date', label: 'Effective Date', type: 'date' },
    { name: 'expiry_date', label: 'Expiry Date', type: 'date' },
    { name: 'barcode', label: 'Barcode', type: 'text' },
    { name: 'station_id', label: 'Assign to Station (optional)', type: 'select',
      options: [{ value: '', label: '— None —' }, ...stations.map(s => ({ value: s.station_id, label: s.name }))] }
  ], async (data) => {
    try {
      const { station_id, ...itemData } = data;
      const result = await apiPost('/api/items', itemData);
      if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
      if (station_id) {
        await apiPost('/api/distribution', { item_id: result.item_id, item_name: result.item_name, station_id, version: data.version });
      }
      loadItemsAdmin();
      showToast('Item added' + (station_id ? ' and assigned' : ''), 'success');
    } catch (err) {
      showToast('Failed to add item: ' + err.message, 'error');
    }
  });
});

async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  await apiDelete(`/api/items/${id}`);
  loadItemsAdmin();
  showToast('Item deleted', 'success');
}

// Distribution Admin
let _allDist = [];

async function loadDistributionAdmin() {
  try {
    const [dist, stations] = await Promise.all([
      apiGet('/api/distribution'),
      apiGet('/api/stations')
    ]);
    _allDist = dist;

    // Populate station filter if empty
    const stationFilter = document.getElementById('dist-filter-station');
    if (stationFilter && stationFilter.options.length <= 1) {
      stationFilter.innerHTML = '<option value="">All Stations</option>' +
        stations.map(s => `<option value="${s.station_id}">${s.name}</option>`).join('');
    }

    renderDistributionList();
  } catch (err) {
    showToast('Failed to load distribution', 'error');
  }
}

async function onDistFilterStationChange() {
  const stationId = document.getElementById('dist-filter-station').value;
  const sublocFilter = document.getElementById('dist-filter-subloc');
  sublocFilter.innerHTML = '<option value="">All Sub-locations</option>';
  sublocFilter.value = '';
  if (stationId) {
    const sublocs = await apiGet(`/api/sub-locations/station/${stationId}`);
    sublocs.forEach(sl => {
      sublocFilter.innerHTML += `<option value="${sl.sub_location_id}">${sl.name}</option>`;
    });
  }
  renderDistributionList();
}

function renderDistributionList() {
  const stationFilter = document.getElementById('dist-filter-station');
  const sublocFilter = document.getElementById('dist-filter-subloc');
  const stationVal = stationFilter ? stationFilter.value : '';
  const sublocVal = sublocFilter ? sublocFilter.value : '';

  let filtered = _allDist;
  if (stationVal) filtered = filtered.filter(d => String(d.station_id) === stationVal);
  if (sublocVal) filtered = filtered.filter(d => String(d.sub_location_id) === sublocVal);

  const container = document.getElementById('distribution-list');
  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">No assignments found.</p>';
    return;
  }
  container.innerHTML = filtered.map(d => `
    <div class="data-item">
      <div class="data-item-info">
        <strong>${d.item_name}</strong>
        <p>Station: ${d.station_name}${d.sub_location_name ? ' → ' + d.sub_location_name : ''} | Version: ${d.version || 'N/A'}</p>
        ${d.remarks ? `<p class="dist-remarks">Remarks: ${d.remarks}</p>` : ''}
      </div>
      <div style="display:flex;gap:var(--space-2);flex-shrink:0">
        <button class="btn btn-primary btn-sm" onclick="reassignDistribution(${d.distribution_id},${d.item_id},'${d.item_name.replace(/'/g,"\\'")}','${(d.remarks||'').replace(/'/g,"\\'")}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDistribution(${d.distribution_id})">Delete</button>
      </div>
    </div>
  `).join('') + LIST_END;
}

async function buildStationSublocForm(formEl, stationSelectId, sublocGroupId, sublocSelectId) {
  document.getElementById(stationSelectId).addEventListener('change', async (e) => {
    const stationId = e.target.value;
    const sublocGroup = document.getElementById(sublocGroupId);
    if (!stationId) { sublocGroup.classList.add('hidden'); return; }
    const sublocs = await apiGet(`/api/sub-locations/station/${stationId}`);
    if (sublocs && sublocs.length > 0) {
      document.getElementById(sublocSelectId).innerHTML =
        `<option value="">— None (whole station) —</option>` +
        sublocs.map(sl => `<option value="${sl.sub_location_id}">${sl.name}</option>`).join('');
      sublocGroup.classList.remove('hidden');
    } else {
      sublocGroup.classList.add('hidden');
    }
  });
}

async function reassignDistribution(distributionId, itemId, itemName, existingRemarks = '') {
  const stations = await apiGet('/api/stations');
  const formHtml = `
    <div class="form-group">
      <label>Station</label>
      <select id="reassign-station" style="padding-left:1rem">
        <option value="">— Select Station —</option>
        ${stations.map(s => `<option value="${s.station_id}">${s.name}</option>`).join('')}
      </select>
    </div>
    <div id="reassign-subloc-group" class="form-group hidden">
      <label>Sub-location</label>
      <select id="reassign-subloc" style="padding-left:1rem"><option value="">— None —</option></select>
    </div>
    <div class="form-group">
      <label>Remarks <span class="label-optional">(optional)</span></label>
      <textarea id="reassign-remarks" rows="2" placeholder="Any notes about this assignment...">${existingRemarks}</textarea>
    </div>
    <button type="button" id="reassign-submit" class="btn btn-primary btn-block" style="margin-top:var(--space-2)">Save</button>
  `;
  document.getElementById('form-title').textContent = `Edit "${itemName}"`;
  document.getElementById('data-form').innerHTML = formHtml;
  document.getElementById('data-form').onsubmit = null;
  buildStationSublocForm(null, 'reassign-station', 'reassign-subloc-group', 'reassign-subloc');
  document.getElementById('reassign-submit').addEventListener('click', async () => {
    const stationId = document.getElementById('reassign-station').value;
    if (!stationId) { showToast('Please select a station', 'warning'); return; }
    const subLocId = document.getElementById('reassign-subloc-group').classList.contains('hidden') ? null :
      document.getElementById('reassign-subloc').value || null;
    const remarks = document.getElementById('reassign-remarks').value.trim() || null;
    await apiDelete(`/api/distribution/${distributionId}`);
    const result = await apiPost('/api/distribution', { item_id: itemId, item_name: itemName, station_id: stationId, sub_location_id: subLocId, remarks });
    if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
    document.getElementById('form-modal').classList.add('hidden');
    loadDistributionAdmin();
    showToast('Assignment updated', 'success');
  });
  document.getElementById('form-modal').classList.remove('hidden');
}

document.getElementById('add-distribution-btn').addEventListener('click', () => showDistributionModal());

async function showDistributionModal() {
  const [groupedItems, stations] = await Promise.all([
    apiGet('/api/items/grouped'),
    apiGet('/api/stations')
  ]);

  const formHtml = `
    <div class="form-group">
      <label>Item Name</label>
      <select id="dist-item-name" style="padding-left:1rem">
        <option value="">— Select Item —</option>
        ${groupedItems.map(g => `<option value="${g.name}">${g.name}</option>`).join('')}
      </select>
    </div>
    <div id="dist-version-group" class="form-group hidden">
      <label>Version</label>
      <select id="dist-version" style="padding-left:1rem"></select>
    </div>
    <div class="form-group">
      <label>Station</label>
      <select id="dist-station" style="padding-left:1rem">
        <option value="">— Select Station —</option>
        ${stations.map(s => `<option value="${s.station_id}">${s.name}</option>`).join('')}
      </select>
    </div>
    <div id="dist-subloc-group" class="form-group hidden">
      <label>Sub-location</label>
      <select id="dist-subloc" style="padding-left:1rem"><option value="">— None (whole station) —</option></select>
    </div>
    <div class="form-group">
      <label>Remarks <span class="label-optional">(optional)</span></label>
      <textarea id="dist-remarks" rows="2" placeholder="Any notes about this assignment..."></textarea>
    </div>
    <button type="button" id="dist-submit-btn" class="btn btn-primary btn-block" style="margin-top:var(--space-2)">Assign</button>
  `;

  document.getElementById('form-title').textContent = 'Assign Item to Station';
  document.getElementById('data-form').innerHTML = formHtml;
  document.getElementById('data-form').onsubmit = null;

  document.getElementById('dist-item-name').addEventListener('change', (e) => {
    const name = e.target.value;
    const group = groupedItems.find(g => g.name === name);
    const versionGroup = document.getElementById('dist-version-group');
    if (group && group.versions.length > 1) {
      document.getElementById('dist-version').innerHTML = group.versions.map(v =>
        `<option value="${v.item_id}" data-version="${v.version || ''}">${v.version || 'No version'} (${v.barcode || 'no barcode'})</option>`
      ).join('');
      versionGroup.classList.remove('hidden');
    } else {
      versionGroup.classList.add('hidden');
    }
  });

  buildStationSublocForm(null, 'dist-station', 'dist-subloc-group', 'dist-subloc');

  document.getElementById('dist-submit-btn').addEventListener('click', async () => {
    const itemName = document.getElementById('dist-item-name').value;
    const stationId = document.getElementById('dist-station').value;
    if (!itemName || !stationId) { showToast('Select item and station', 'warning'); return; }

    const group = groupedItems.find(g => g.name === itemName);
    let itemId, version;
    if (group.versions.length > 1) {
      const sel = document.getElementById('dist-version');
      itemId = sel.value;
      version = sel.options[sel.selectedIndex].dataset.version;
    } else {
      itemId = group.versions[0].item_id;
      version = group.versions[0].version;
    }
    const subLocId = document.getElementById('dist-subloc-group').classList.contains('hidden') ? null :
      document.getElementById('dist-subloc').value || null;
    const remarks = document.getElementById('dist-remarks').value.trim() || null;

    const result = await apiPost('/api/distribution', { item_id: itemId, item_name: itemName, station_id: stationId, version, sub_location_id: subLocId, remarks });
    if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
    document.getElementById('form-modal').classList.add('hidden');
    loadDistributionAdmin();
    showToast('Item assigned', 'success');
  });

  document.getElementById('form-modal').classList.remove('hidden');
}

async function deleteDistribution(id) {
  if (!confirm('Remove this assignment?')) return;
  await apiDelete(`/api/distribution/${id}`);
  loadDistributionAdmin();
  showToast('Assignment removed', 'success');
}

// Users Admin
async function loadUsersAdmin() {
  try {
    const users = await apiGet('/api/users');
    const container = document.getElementById('users-list');
    
    container.innerHTML = users.map(u => `
      <div class="data-item">
        <div>
          <strong>${u.username}</strong>
          <p>Role: ${u.role}</p>
        </div>
        ${u.username !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.user_id})">Delete</button>` : ''}
      </div>
    `).join('') + LIST_END;
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
}

document.getElementById('add-user-btn').addEventListener('click', () => {
  showFormModal('Add User', [
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
    { name: 'role', label: 'Role', type: 'select', options: [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }] }
  ], async (data) => {
    await apiPost('/api/users', data);
    loadUsersAdmin();
    showToast('User added', 'success');
  });
});

async function deleteUser(id) {
  if (!confirm('Delete this user?')) return;
  await apiDelete(`/api/users/${id}`);
  loadUsersAdmin();
  showToast('User deleted', 'success');
}

// ==================== FORM MODAL ====================

function showFormModal(title, fields, onSubmit) {
  document.getElementById('form-title').textContent = title;
  const form = document.getElementById('data-form');
  
  form.innerHTML = fields.map(f => {
    if (f.type === 'select') {
      return `
        <div class="form-group">
          <label for="field-${f.name}">${f.label}</label>
          <select id="field-${f.name}" name="${f.name}" ${f.required ? 'required' : ''}>
            ${f.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
        </div>
      `;
    }
    return `
      <div class="form-group">
        <label for="field-${f.name}">${f.label}</label>
        <input type="${f.type}" id="field-${f.name}" name="${f.name}" ${f.required ? 'required' : ''}>
      </div>
    `;
  }).join('') + '<button type="submit" class="btn btn-primary">Save</button>';
  
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    fields.forEach(f => {
      data[f.name] = document.getElementById(`field-${f.name}`).value;
    });
    await onSubmit(data);
    document.getElementById('form-modal').classList.add('hidden');
  };
  
  document.getElementById('form-modal').classList.remove('hidden');
}

// ==================== SUB-LOCATIONS ADMIN ====================

let _allSubLocs = [];

async function loadSubLocationsAdmin() {
  try {
    const [sublocs, stations] = await Promise.all([
      apiGet('/api/sub-locations'),
      apiGet('/api/stations')
    ]);
    _allSubLocs = sublocs;

    // Populate station filter if not already done
    const filterEl = document.getElementById('subloc-station-filter');
    if (filterEl && filterEl.options.length <= 1) {
      filterEl.innerHTML = '<option value="">All Stations</option>' +
        stations.map(s => `<option value="${s.station_id}">${s.name}</option>`).join('');
    }

    renderSubLocsList();
  } catch (err) {
    showToast('Failed to load sub-locations', 'error');
  }
}

function renderSubLocsList() {
  const filterEl = document.getElementById('subloc-station-filter');
  const filterVal = filterEl ? filterEl.value : '';
  const filtered = filterVal
    ? _allSubLocs.filter(sl => String(sl.station_id) === filterVal)
    : _allSubLocs;
  const container = document.getElementById('sub-locations-list');
  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">No sub-locations found.</p>';
    return;
  }
  container.innerHTML = filtered.map(sl => `
    <div class="data-item">
      <div>
        <strong>${sl.name}</strong>
        <p>Station: ${sl.station_name}</p>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteSubLocation(${sl.sub_location_id})">Delete</button>
    </div>
  `).join('') + LIST_END;
}

document.getElementById('add-sublocation-btn').addEventListener('click', async () => {
  const stations = await apiGet('/api/stations');
  showFormModal('Add Sub-location', [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'station_id', label: 'Station', type: 'select', options: stations.map(s => ({ value: s.station_id, label: s.name })), required: true }
  ], async (data) => {
    const result = await apiPost('/api/sub-locations', data);
    if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
    loadSubLocationsAdmin();
    showToast('Sub-location added', 'success');
  });
});

async function deleteSubLocation(id) {
  if (!confirm('Delete this sub-location?')) return;
  await apiDelete(`/api/sub-locations/${id}`);
  loadSubLocationsAdmin();
  showToast('Sub-location deleted', 'success');
}

// ==================== QUERY PAGE ====================

async function loadQueryPage() {
  try {
    const stations = await apiGet('/api/stations');
    const select = document.getElementById('query-station-select');
    select.innerHTML = '<option value="">— Select a Station —</option>' +
      stations.map(s => `<option value="${s.station_id}">${s.name}</option>`).join('');
    document.getElementById('query-results').classList.add('hidden');
  } catch (err) {
    showToast('Failed to load stations', 'error');
  }
}

document.getElementById('query-station-select').addEventListener('change', async (e) => {
  const stationId = e.target.value;
  if (!stationId) { document.getElementById('query-results').classList.add('hidden'); return; }
  await loadStationAudits(stationId);
});

async function loadStationAudits(stationId) {
  const audits = await apiGet(`/api/audits/by-station/${stationId}`);
  const active = audits.filter(a => a.status === 'in_progress');
  const completed = audits.filter(a => a.status === 'completed');

  document.getElementById('query-results').classList.remove('hidden');

  const activeContainer = document.getElementById('query-active-audits');
  activeContainer.innerHTML = active.length ? active.map(a => `
    <div class="data-item">
      <div>
        <strong>Audit #${a.audit_id}</strong>
        <p>By: ${a.auditor} · ${new Date(a.start_time).toLocaleString()}</p>
        <p>Found: ${a.found_count} · Missing: ${a.missing_count}</p>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteQueryAudit(${a.audit_id})">Delete</button>
    </div>
  `).join('') : '<p class="empty-state" style="padding:var(--space-3)">No active audits</p>';

  const completedContainer = document.getElementById('query-past-audits');
  completedContainer.innerHTML = completed.length ? completed.map(a => {
    const d = new Date(a.start_time);
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="data-item">
        <div>
          <strong>${dateStr} ${timeStr}</strong>
          <p>By: ${a.auditor}</p>
          <p>✓ ${a.found_count} Found · ✗ ${a.missing_count} Missing · ⚠ ${a.misplaced_count} Misplaced</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="printAuditReport(${a.audit_id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print
        </button>
      </div>
    `;
  }).join('') : '<p class="empty-state" style="padding:var(--space-3)">No completed audits</p>';
}

async function deleteQueryAudit(auditId) {
  if (!confirm('Delete this in-progress audit?')) return;
  const result = await apiDelete(`/api/audits/${auditId}`);
  if (result.error) { showToast('Error: ' + result.error, 'error'); return; }
  const stationId = document.getElementById('query-station-select').value;
  loadStationAudits(stationId);
  showToast('Audit deleted', 'success');
}

async function printAuditReport(auditId) {
  try {
    const report = await apiGet(`/api/reports/audits/${auditId}`);
    const html = buildA4ReportHtml(report);
    const printArea = document.getElementById('print-report-area');
    printArea.innerHTML = html;
    printArea.style.display = 'block';
    document.body.classList.add('printing-single-report');
    window.print();
    document.body.classList.remove('printing-single-report');
    printArea.style.display = 'none';
  } catch (err) {
    showToast('Failed to load report for printing', 'error');
  }
}

function formatAction(action) {
  const map = {
    'Old_Replace': 'Old ver. item, replace ASAP',
    'Old_Replaced': 'Old ver. item replaced',
    'Misplaced_Removed': 'Misplaced Item removed'
  };
  return map[action] || action || '—';
}

function buildA4ReportHtml(report) {
  const d = new Date(report.start_time);
  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const bySubLoc = {};
  const misplacedItems = [];

  (report.items || []).forEach(item => {
    if (item.status === 'Misplaced' && item.action) {
      misplacedItems.push(item);
    } else {
      const key = item.sub_location_name || 'General';
      if (!bySubLoc[key]) bySubLoc[key] = [];
      bySubLoc[key].push(item);
    }
  });

  const statusBadge = (s) => {
    const cls = s === 'Found' ? 'rpt-found' : s === 'Missing' ? 'rpt-missing' : 'rpt-misplaced';
    return `<span class="${cls}">${s}</span>`;
  };

  const subLocSections = Object.entries(bySubLoc).map(([slName, items]) => `
    <div class="rpt-subloc-block">
      <div class="rpt-subloc-header">${slName}</div>
      <table class="rpt-table">
        <thead><tr><th>Item</th><th>Version</th><th>Status</th><th>Condition</th></tr></thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td>${it.item_name}</td>
              <td>${it.version || it.item_version || '—'}</td>
              <td>${statusBadge(it.status)}</td>
              <td>${it.condition || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  const misplacedSection = misplacedItems.length ? `
    <div class="rpt-subloc-block">
      <div class="rpt-subloc-header rpt-subloc-misplaced">Misplaced Items</div>
      <table class="rpt-table">
        <thead><tr><th>Item</th><th>Action Taken</th></tr></thead>
        <tbody>
          ${misplacedItems.map(it => `<tr><td>${it.item_name}</td><td>${formatAction(it.action)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <div class="a4-report">
      <div class="rpt-header">
        <div class="rpt-title-block">
          <h1 class="rpt-station">${report.station_name}</h1>
          <div class="rpt-brand">DHL Cargo Audit System</div>
        </div>
        <div class="rpt-meta-block">
          <div><strong>Date:</strong> ${dateStr}</div>
          <div><strong>Time:</strong> ${timeStr}</div>
          <div><strong>Auditor:</strong> ${report.auditor}</div>
        </div>
      </div>
      <div class="rpt-summary-row">
        <span class="rpt-stat rpt-found">✓ ${report.found_count} Found</span>
        <span class="rpt-stat rpt-missing">✗ ${report.missing_count} Missing</span>
        ${report.misplaced_count > 0 ? `<span class="rpt-stat rpt-misplaced">⚠ ${report.misplaced_count} Misplaced</span>` : ''}
      </div>
      ${subLocSections}
      ${misplacedSection}
    </div>
  `;
}

// ==================== ISSUES SCREEN ====================

function loadIssuesScreen() {
  document.getElementById('issue-form').reset();
  loadMyIssues();
}

document.getElementById('issue-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('issue-title').value;
  const category = document.getElementById('issue-category').value;
  const description = document.getElementById('issue-description').value;
  
  try {
    await apiPost('/api/reports/issues', { title, category, description });
    showToast('Issue reported successfully!', 'success');
    document.getElementById('issue-form').reset();
    loadMyIssues();
  } catch (err) {
    showToast('Failed to submit report', 'error');
  }
});

async function loadMyIssues() {
  try {
    const issues = await apiGet('/api/reports/issues');
    const section = document.getElementById('my-issues-section');
    const list = document.getElementById('my-issues-list');
    
    if (issues && issues.length > 0) {
      section.classList.remove('hidden');
      list.innerHTML = issues.map(i => `
        <div class="report-card">
          <div class="report-card-header">
            <h4>${i.title}</h4>
            <span class="badge ${i.status === 'open' ? 'in_progress' : 'completed'}">${i.status}</span>
          </div>
          <p class="report-location">${i.category} | ${new Date(i.created_at).toLocaleDateString()}</p>
          <p style="color: var(--gray-600); font-size: 0.875rem; margin-top: var(--space-2);">${i.description}</p>
        </div>
      `).join('');
    } else {
      section.classList.add('hidden');
    }
  } catch (err) {
    console.log('Could not load issues');
  }
}

// ==================== ADMIN ISSUES & SETTINGS ====================

let adminReportsData = null;

document.getElementById('export-reports-csv-btn').addEventListener('click', () => {
  if (!adminReportsData || !adminReportsData.length) {
    showToast('No report data to export', 'warning');
    return;
  }
  const rows = [['Date', 'Station', 'Time', 'Auditor', 'Found', 'Missing', 'Misplaced', 'Missing Items']];
  adminReportsData.forEach(group => {
    group.audits.forEach(a => {
      const time = new Date(a.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      rows.push([group.date, a.station_name, time, a.auditor, a.found_count, a.missing_count, a.misplaced_count, a.missing_items.join('; ')]);
    });
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-reports-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('export-reports-pdf-btn').addEventListener('click', () => {
  if (!adminReportsData || !adminReportsData.length) {
    showToast('No report data to export', 'warning');
    return;
  }
  const printArea = document.getElementById('print-reports-area');
  printArea.innerHTML = `<h2 style="font-family:sans-serif;margin-bottom:1rem">Audit Reports — ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</h2>` + document.getElementById('admin-reports-list').innerHTML;
  printArea.style.display = 'block';
  document.body.classList.add('printing-reports');
  window.print();
  document.body.classList.remove('printing-reports');
  printArea.style.display = 'none';
});

async function loadAdminReports() {
  const container = document.getElementById('admin-reports-list');
  container.innerHTML = '<p class="empty-state">Loading...</p>';
  try {
    const groups = await apiGet('/api/reports/by-date');
    adminReportsData = groups;
    if (!groups || groups.length === 0) {
      container.innerHTML = '<p class="empty-state">No completed audits yet.</p>';
      return;
    }

    container.innerHTML = groups.map(group => {
      const dateLabel = new Date(group.date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      const auditCards = group.audits.map(a => {
        const time = new Date(a.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const allGood = a.missing_count === 0 && a.misplaced_count === 0;
        const missingList = a.missing_items.length
          ? `<div class="missing-items-list">
               <span class="missing-label">Missing:</span>
               ${a.missing_items.map(n => `<span class="missing-item-tag">${n}</span>`).join('')}
             </div>`
          : '';

        return `
          <div class="audit-report-card ${allGood ? 'card-all-good' : 'card-has-missing'}">
            <div class="audit-report-card-header">
              <div>
                <div class="audit-report-station">${a.station_name}</div>
                <div class="audit-report-meta">${time} &nbsp;·&nbsp; ${a.auditor}</div>
              </div>
              <div class="audit-report-badge ${allGood ? 'badge-all-good' : 'badge-has-missing'}">
                ${allGood ? 'All Good' : `${a.missing_count} Missing`}
              </div>
            </div>
            <div class="audit-report-counts">
              <span class="count-found">✓ ${a.found_count} Found</span>
              <span class="count-missing">✗ ${a.missing_count} Missing</span>
              ${a.misplaced_count > 0 ? `<span class="count-misplaced">⚠ ${a.misplaced_count} Misplaced</span>` : ''}
            </div>
            ${missingList}
          </div>`;
      }).join('');

      return `
        <div class="date-group">
          <div class="date-group-header">${dateLabel}</div>
          ${auditCards}
        </div>`;
    }).join('') + LIST_END;
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Failed to load reports.</p>';
  }
}

async function loadAdminIssues() {
  try {
    const issues = await apiGet('/api/reports/issues');
    const container = document.getElementById('admin-issues-list');
    
    if (!issues || issues.length === 0) {
      container.innerHTML = '<p class="empty-state">No issue reports yet</p>';
      return;
    }
    
    container.innerHTML = issues.map(i => `
      <div class="data-item">
        <div class="data-item-info">
          <h4>${i.title}</h4>
          <p>${i.category} | By: ${i.username} | ${new Date(i.created_at).toLocaleDateString()}</p>
          <p style="margin-top: 4px; color: var(--gray-600);">${i.description}</p>
        </div>
        <div style="display: flex; gap: var(--space-2); align-items: center;">
          <span class="badge ${i.status === 'open' ? 'in_progress' : 'completed'}">${i.status}</span>
          ${i.status === 'open' ? `<button class="btn btn-success btn-sm" onclick="resolveIssue(${i.report_id})">Resolve</button>` : ''}
        </div>
      </div>
    `).join('') + LIST_END;
  } catch (err) {
    showToast('Failed to load issues', 'error');
  }
}

async function resolveIssue(id) {
  try {
    await apiPut(`/api/reports/issues/${id}`, { status: 'resolved' });
    loadAdminIssues();
    showToast('Issue resolved', 'success');
  } catch (err) {
    showToast('Failed to resolve issue', 'error');
  }
}

async function loadSettings() {
  try {
    const setting = await apiGet('/api/settings/admin_email');
    if (setting && setting.value) {
      document.getElementById('admin-email').value = setting.value;
    }
  } catch (err) {
    console.log('No settings found');
  }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value;
  
  try {
    await apiPost('/api/settings', { key: 'admin_email', value: email });
    showToast('Settings saved!', 'success');
  } catch (err) {
    showToast('Failed to save settings', 'error');
  }
});

// ==================== BACKUPS ====================

async function loadBackupsAdmin() {
  const container = document.getElementById('backups-list');
  container.innerHTML = '<p class="empty-state">Loading backups…</p>';
  try {
    const backups = await apiGet('/api/backups');
    if (!backups || backups.length === 0) {
      container.innerHTML = '<p class="empty-state">No backups yet. Backups are created automatically after any data change.</p>';
      return;
    }
    container.innerHTML = backups.map(b => {
      // filename: audit_YYYY-MM-DD_HH-MM-SS.db  →  "YYYY-MM-DD HH:MM:SS"
      const label = b.filename
        .replace(/^audit_/, '')
        .replace(/\.db$/, '')
        .replace(/_(\d{2})-(\d{2})-(\d{2})$/, ' $1:$2:$3');
      const kb = Math.round(b.size / 1024);
      const size = kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB';
      return `
        <div class="data-item">
          <div class="data-item-info">
            <h4 style="font-family: monospace; font-size: 0.9rem;">${label}</h4>
            <p>${size}</p>
          </div>
          <button class="btn btn-danger btn-sm" onclick="restoreBackup('${b.filename}')">Restore</button>
        </div>
      `;
    }).join('') + LIST_END;
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Failed to load backups</p>';
  }
}

async function createManualBackup() {
  const btn = document.getElementById('create-backup-btn');
  btn.disabled = true;
  try {
    await apiPost('/api/backups/create', {});
    showToast('Backup created', 'success');
    loadBackupsAdmin();
  } catch (err) {
    showToast('Backup failed', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function restoreBackup(filename) {
  const label = filename.replace(/^audit_/, '').replace(/\.db$/, '').replace(/_(\d{2})-(\d{2})-(\d{2})$/, ' $1:$2:$3');
  if (!confirm(`Restore database from:\n${label}\n\nThe current database will be saved as a backup first, then the server will restart. Continue?`)) return;
  try {
    await apiPost('/api/backups/restore', { filename });
    showToast('Restoring… server restarting', 'info');
    setTimeout(() => location.reload(), 4000);
  } catch (err) {
    showToast('Restore failed: ' + (err.message || 'unknown error'), 'error');
  }
}

// ==================== OFFLINE SUPPORT ====================

const OFFLINE_QUEUE_KEY = 'offline_write_queue';

function enqueueWrite(method, endpoint, data) {
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  q.push({ method, endpoint, data, ts: Date.now() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
}

async function flushOfflineQueue() {
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (!q.length) return;
  const token = localStorage.getItem('token');
  const remaining = [];
  for (const item of q) {
    try {
      const opts = {
        method: item.method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
      };
      if (item.data) opts.body = JSON.stringify(item.data);
      const res = await fetch(item.endpoint, opts);
      if (!res.ok) remaining.push(item); // server error — keep in queue
    } catch {
      remaining.push(item);
      break; // still offline, stop trying
    }
  }
  if (remaining.length < q.length) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    if (remaining.length === 0) {
      showToast('Synced ' + q.length + ' offline change' + (q.length > 1 ? 's' : ''), 'success');
    }
  }
}

function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  banner.classList.toggle('hidden', navigator.onLine);
  document.body.classList.toggle('is-offline', !navigator.onLine);
}

window.addEventListener('online', () => {
  updateOnlineStatus();
  flushOfflineQueue();
});
window.addEventListener('offline', updateOnlineStatus);

// ==================== TOAST ====================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ==================== PWA ====================

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.log('SW registration failed');
  });
}

// ==================== INIT ====================

init();
