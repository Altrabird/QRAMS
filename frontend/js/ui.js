/* ui.js — tiny DOM + formatting helpers shared by every view. */

const UI = {
  el(id) { return document.getElementById(id); },
  view() { return document.getElementById('view'); },

  /* ESCAPE HTML — always run user/DB text through this before putting it in the
     DOM. This is the frontend half of XSS defense (the backend sanitizes too). */
  esc(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  },

  /* Toast notification (bottom-right). type: success | danger | warning | info */
  toast(message, type = 'success') {
    const id = 't' + Date.now();
    const icon = { success: 'check-circle', danger: 'exclamation-triangle', warning: 'exclamation-circle', info: 'info-circle' }[type] || 'info-circle';
    const html =
      `<div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert">
         <div class="d-flex">
           <div class="toast-body"><i class="bi bi-${icon} me-2"></i>${this.esc(message)}</div>
           <button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
         </div>
       </div>`;
    this.el('toasts').insertAdjacentHTML('beforeend', html);
    const node = this.el(id);
    const t = new bootstrap.Toast(node, { delay: 3200 });
    t.show();
    node.addEventListener('hidden.bs.toast', () => node.remove());
  },

  /* Show a Bootstrap modal with arbitrary inner HTML. Returns the instance. */
  modal(innerHtml) {
    this.el('appModalContent').innerHTML = innerHtml;
    const m = bootstrap.Modal.getOrCreateInstance(this.el('appModal'));
    m.show();
    return m;
  },
  closeModal() { bootstrap.Modal.getOrCreateInstance(this.el('appModal')).hide(); },

  /* Full-view loading + error states. */
  loading(msg = 'Loading…') {
    this.view().innerHTML =
      `<div class="empty"><div class="spinner-border text-primary mb-3"></div><div>${this.esc(msg)}</div></div>`;
  },
  error(msg) {
    this.view().innerHTML =
      `<div class="empty"><i class="bi bi-wifi-off text-danger"></i>
        <h3 class="h6 mt-3">Something went wrong</h3>
        <p class="small">${this.esc(msg)}</p>
        <button class="btn btn-sm btn-outline-primary" onclick="Router.reload()">Try again</button></div>`;
  },
  emptyState(icon, title, sub, actionHtml = '') {
    return `<div class="empty"><i class="bi bi-${icon}"></i><h3 class="h6 mt-3">${this.esc(title)}</h3>
            <p class="small">${this.esc(sub)}</p>${actionHtml}</div>`;
  },

  /* Formatting */
  date(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? this.esc(v) : d.toLocaleDateString(); },
  dateTime(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? this.esc(v) : d.toLocaleString(); },

  progressPill(p) {
    const cls = p === 'Completed' ? 'pill-done' : (p === 'Not Started' || !p) ? 'pill-none' : 'pill-prog';
    return `<span class="pill ${cls}">${this.esc(p || 'Not Started')}</span>`;
  },
  statusBadge(s) {
    const map = { Active: 'success', Paused: 'warning', Completed: 'primary', Archived: 'secondary', Disabled: 'danger', Expired: 'dark' };
    return `<span class="badge text-bg-${map[s] || 'secondary'}">${this.esc(s)}</span>`;
  },

  /* Build the scan URL a QR should encode. New codes point at the QRAMS quiz
     player page (clean URL, handles every task type: it plays built-in quizzes
     and forwards link/hosted tasks). Falls back to the old GAS ?id= form if no
     player URL is configured. Old printed QRs keep working via GAS. */
  scanUrl(token) {
    const player = QRAMS.getPlayerUrl();
    if (player) return player + '?t=' + encodeURIComponent(token);
    const base = QRAMS.getApiUrl();
    return base ? base + '?id=' + encodeURIComponent(token) : '';
  },

  /* Render <option> list, optionally pre-selected. */
  options(values, selected) {
    return values.map(v => `<option value="${this.esc(v)}"${v === selected ? ' selected' : ''}>${this.esc(v)}</option>`).join('');
  },
};
