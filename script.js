/**
 * ════════════════════════════════════════════════════════
 *  MedTrack — script.js
 *  Medication Expiry Tracker | Vanilla JS + LocalStorage
 * ════════════════════════════════════════════════════════
 *
 *  Data structure (array stored in LocalStorage):
 *  [
 *    { id: "uuid", name: "Amoxicillin 500mg", expDate: "2025-06-15" },
 *    ...
 *  ]
 *
 *  Expiry logic:
 *  - Expired      : expDate < today
 *  - Expiring Soon: 0 ≤ daysLeft ≤ 7
 *  - Valid         : daysLeft > 7
 * ════════════════════════════════════════════════════════
 */

/* ──────────────────────────────────────────────────────
   CONSTANTS & STATE
─────────────────────────────────────────────────────── */
const LS_KEY    = 'medtrack_medications';   // LocalStorage key
const SOON_DAYS = 7;                        // "Expiring soon" threshold

let medications  = [];        // In-memory array
let activeFilter = 'all';     // Current tab filter
let bannerDismissed = false;  // Track manual banner dismiss

/* ──────────────────────────────────────────────────────
   INIT — runs on page load
─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Set current year in footer
  document.getElementById('year').textContent = new Date().getFullYear();

  // Load saved medications from LocalStorage
  loadFromStorage();

  // Render the full UI
  renderList();
  renderStats();
  updateBanner();

  // Allow pressing Enter to add medication
  document.getElementById('med-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addMedication();
  });
  document.getElementById('exp-date').addEventListener('keydown', e => {
    if (e.key === 'Enter') addMedication();
  });
});

/* ──────────────────────────────────────────────────────
   LOCAL STORAGE HELPERS
─────────────────────────────────────────────────────── */

/**
 * Load medications array from LocalStorage.
 * Falls back to empty array if nothing is saved.
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    medications = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
    medications = [];
  }
}

/**
 * Save current medications array to LocalStorage.
 */
function saveToStorage() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(medications));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
    showToast('Storage error. Please check browser settings.', 'error');
  }
}

/* ──────────────────────────────────────────────────────
   EXPIRY LOGIC
─────────────────────────────────────────────────────── */

/**
 * Return today's date normalised to midnight (no time component).
 */
function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate days remaining until expiration.
 * Negative = already expired.
 * @param {string} expDateStr  e.g. "2025-06-15"
 * @returns {number} integer days left (can be negative)
 */
function getDaysLeft(expDateStr) {
  const today  = getToday();
  const expiry = new Date(expDateStr + 'T00:00:00'); // force local timezone
  const diff   = expiry - today;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Determine status category for a medication.
 * @param {string} expDateStr
 * @returns {'expired'|'soon'|'valid'}
 */
function getStatus(expDateStr) {
  const days = getDaysLeft(expDateStr);
  if (days < 0)            return 'expired';
  if (days <= SOON_DAYS)   return 'soon';
  return 'valid';
}

/* ──────────────────────────────────────────────────────
   ADD MEDICATION
─────────────────────────────────────────────────────── */

/**
 * Validate inputs and add a new medication.
 * Called by the Add button (or Enter key).
 */
function addMedication() {
  const nameInput = document.getElementById('med-name');
  const dateInput = document.getElementById('exp-date');

  const name    = nameInput.value.trim();
  const expDate = dateInput.value;

  // Clear previous errors
  clearErrors();

  // Validate
  let valid = true;

  if (!name) {
    showFieldError('name-error', nameInput, 'Medication name is required.');
    valid = false;
  }

  if (!expDate) {
    showFieldError('date-error', dateInput, 'Expiration date is required.');
    valid = false;
  }

  if (!valid) return;

  // Build medication object
  const med = {
    id:      generateId(),
    name:    name,
    expDate: expDate,
    addedAt: new Date().toISOString()
  };

  // Add to array & persist
  medications.push(med);
  saveToStorage();

  // Reset form
  nameInput.value = '';
  dateInput.value = '';
  nameInput.focus();

  // Re-render everything
  bannerDismissed = false; // reset so banner can show again
  renderList();
  renderStats();
  updateBanner();

  showToast(`✓ "${name}" added successfully.`, 'success');
}

/* ──────────────────────────────────────────────────────
   DELETE MEDICATION
─────────────────────────────────────────────────────── */

/**
 * Remove a medication by its ID.
 * @param {string} id
 */
function deleteMedication(id) {
  const med = medications.find(m => m.id === id);
  if (!med) return;

  // Remove from array
  medications = medications.filter(m => m.id !== id);
  saveToStorage();

  // Re-render
  renderList();
  renderStats();
  updateBanner();

  showToast(`"${med.name}" removed.`);
}

/* ──────────────────────────────────────────────────────
   RENDER LIST
─────────────────────────────────────────────────────── */

/**
 * Render the medications table based on active filter + search query.
 */
function renderList() {
  const tbody      = document.getElementById('med-tbody');
  const emptyState = document.getElementById('empty-state');
  const searchVal  = document.getElementById('search-input').value.toLowerCase().trim();

  // 1. Filter by status tab
  let filtered = medications.filter(m => {
    if (activeFilter === 'all') return true;
    return getStatus(m.expDate) === activeFilter;
  });

  // 2. Filter by search query
  if (searchVal) {
    filtered = filtered.filter(m =>
      m.name.toLowerCase().includes(searchVal)
    );
  }

  // 3. Sort: expired first, then expiring soon, then valid (by date ASC within group)
  filtered.sort((a, b) => {
    const statusOrder = { expired: 0, soon: 1, valid: 2 };
    const sa = statusOrder[getStatus(a.expDate)];
    const sb = statusOrder[getStatus(b.expDate)];
    if (sa !== sb) return sa - sb;
    return new Date(a.expDate) - new Date(b.expDate);
  });

  // 4. Build table rows
  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  tbody.innerHTML = filtered.map((med, index) => {
    const status   = getStatus(med.expDate);
    const daysLeft = getDaysLeft(med.expDate);
    const rowClass = status === 'expired' ? 'row-expired' : status === 'soon' ? 'row-soon' : '';

    return `
      <tr class="${rowClass}" data-id="${escapeHtml(med.id)}">
        <td style="color:var(--text-muted);font-size:13px;">${index + 1}</td>
        <td><span class="med-name">${escapeHtml(med.name)}</span></td>
        <td><span class="med-date">${formatDate(med.expDate)}</span></td>
        <td>${renderDaysLeft(daysLeft)}</td>
        <td>${renderBadge(status)}</td>
        <td>
          <button
            class="btn-delete"
            onclick="deleteMedication('${escapeHtml(med.id)}')"
            aria-label="Delete ${escapeHtml(med.name)}"
          >
            🗑 Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ──────────────────────────────────────────────────────
   RENDER STATS
─────────────────────────────────────────────────────── */

/**
 * Update the four stat counters (total / valid / soon / expired).
 */
function renderStats() {
  const counts = { valid: 0, soon: 0, expired: 0 };

  medications.forEach(m => {
    counts[getStatus(m.expDate)]++;
  });

  document.getElementById('stat-total').textContent   = medications.length;
  document.getElementById('stat-valid').textContent   = counts.valid;
  document.getElementById('stat-soon').textContent    = counts.soon;
  document.getElementById('stat-expired').textContent = counts.expired;
}

/* ──────────────────────────────────────────────────────
   ALERT BANNER
─────────────────────────────────────────────────────── */

/**
 * Show or hide the top alert banner based on expired/soon medications.
 */
function updateBanner() {
  if (bannerDismissed) return;

  const banner    = document.getElementById('alert-banner');
  const alertText = document.getElementById('alert-text');

  const expiredCount = medications.filter(m => getStatus(m.expDate) === 'expired').length;
  const soonCount    = medications.filter(m => getStatus(m.expDate) === 'soon').length;

  if (expiredCount === 0 && soonCount === 0) {
    banner.classList.add('hidden');
    return;
  }

  // Build message
  const parts = [];
  if (expiredCount > 0) parts.push(`${expiredCount} medication${expiredCount > 1 ? 's are' : ' is'} expired`);
  if (soonCount    > 0) parts.push(`${soonCount} medication${soonCount > 1 ? 's are' : ' is'} expiring within 7 days`);

  alertText.textContent = parts.join(' and ') + '. Please review and take action.';

  // Style based on severity
  if (expiredCount > 0) {
    banner.classList.add('has-expired');
  } else {
    banner.classList.remove('has-expired');
  }

  banner.classList.remove('hidden');
}

/**
 * Dismiss the alert banner (user clicked ✕).
 */
function dismissBanner() {
  bannerDismissed = true;
  document.getElementById('alert-banner').classList.add('hidden');
}

/* ──────────────────────────────────────────────────────
   FILTER TABS
─────────────────────────────────────────────────────── */

/**
 * Set the active status filter and re-render the list.
 * @param {HTMLElement} btn  The clicked tab button
 */
function setFilter(btn) {
  // Update active class on tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Update state
  activeFilter = btn.dataset.filter;
  renderList();
}

/* ──────────────────────────────────────────────────────
   UI HELPERS
─────────────────────────────────────────────────────── */

/**
 * Render a coloured status badge HTML string.
 */
function renderBadge(status) {
  const config = {
    valid:   { cls: 'badge-valid',   icon: '✔', label: 'Valid' },
    soon:    { cls: 'badge-soon',    icon: '⚡', label: 'Expiring Soon' },
    expired: { cls: 'badge-expired', icon: '✕', label: 'Expired' },
  };
  const { cls, icon, label } = config[status];
  return `<span class="badge ${cls}">${icon} ${label}</span>`;
}

/**
 * Render the "days left" cell with colour coding.
 */
function renderDaysLeft(days) {
  if (days < 0) {
    return `<span class="days-left negative">${Math.abs(days)}d ago</span>`;
  }
  if (days === 0) {
    return `<span class="days-left warning">Today</span>`;
  }
  if (days <= SOON_DAYS) {
    return `<span class="days-left warning">${days}d left</span>`;
  }
  return `<span class="days-left positive">${days}d left</span>`;
}

/**
 * Format an ISO date string (YYYY-MM-DD) to a readable format.
 * e.g. "2025-06-15" → "15 Jun 2025"
 */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Show a validation error on a field.
 */
function showFieldError(errorId, inputEl, message) {
  document.getElementById(errorId).textContent = message;
  inputEl.classList.add('error');
}

/**
 * Clear all field validation errors.
 */
function clearErrors() {
  document.getElementById('name-error').textContent = '';
  document.getElementById('date-error').textContent = '';
  document.getElementById('med-name').classList.remove('error');
  document.getElementById('exp-date').classList.remove('error');
}

/**
 * Show a temporary toast notification.
 * @param {string} message
 * @param {'success'|'error'|''} type
 */
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className   = `toast toast-${type}`;
  toast.classList.remove('hidden');

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

/**
 * Generate a simple unique ID.
 * Uses crypto.randomUUID if available, otherwise fallback.
 */
function generateId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
