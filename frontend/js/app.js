/* app.js — boot, router, and all page views.
   Kept in one file on purpose so a teacher can read the whole UI flow top to
   bottom. Each view is a function that renders HTML into #view. */

/* ============================ BOOT ============================ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  wireShell();
  if (QRAMS.isLoggedIn()) showApp();
  else showLogin();
  // Register the service worker for offline/PWA (ignored when opened via file://).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
});

function initTheme() {
  const t = localStorage.getItem(QRAMS.KEYS.THEME) || 'light';
  document.documentElement.setAttribute('data-bs-theme', t);
  updateThemeIcon(t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-bs-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bs-theme', next);
  localStorage.setItem(QRAMS.KEYS.THEME, next);
  updateThemeIcon(next);
}
function updateThemeIcon(t) {
  const i = document.querySelector('#themeBtn i');
  if (i) i.className = t === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
}

/* Wire global shell controls (run once). */
function wireShell() {
  UI.el('themeBtn')?.addEventListener('click', toggleTheme);
  UI.el('menuBtn')?.addEventListener('click', () => UI.el('sidebar').classList.toggle('open'));
  UI.el('sidebarBackdrop')?.addEventListener('click', () => UI.el('sidebar').classList.remove('open'));
  UI.el('logoutBtn')?.addEventListener('click', (e) => { e.preventDefault(); doLogout(); });
  UI.el('loginForm')?.addEventListener('submit', doLogin);
  UI.el('loginConfigLink')?.addEventListener('click', (e) => { e.preventDefault(); connectionModal(); });
  window.addEventListener('hashchange', () => Router.handle());
}

/* ============================ AUTH ============================ */
function showLogin() {
  UI.el('appShell').classList.add('d-none');
  UI.el('loginView').classList.remove('d-none');
  if (!QRAMS.getApiUrl()) setTimeout(connectionModal, 200);
}
function showApp() {
  UI.el('loginView').classList.add('d-none');
  UI.el('appShell').classList.remove('d-none');
  const u = QRAMS.getUser() || {};
  UI.el('userName').textContent = u.name || 'User';
  UI.el('userRole').textContent = 'Role: ' + (u.role || '—');
  loadSchoolName();
  if (!location.hash) location.hash = '#/dashboard';
  Router.handle();
}

async function doLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Signing in…';
  try {
    if (!QRAMS.getApiUrl()) { connectionModal(); throw new Error('Set the API URL first.'); }
    const { token, user } = await Api.login(UI.el('loginEmail').value.trim(), UI.el('loginPin').value);
    QRAMS.setSession(token, user);
    UI.toast('Welcome, ' + user.name + '!');
    showApp();
  } catch (err) {
    UI.toast(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Sign in';
  }
}
async function doLogout() {
  try { await Api.logout(); } catch (e) {}
  QRAMS.clearSession();
  UI.toast('Signed out.', 'info');
  showLogin();
}

/* Modal to set/test the Apps Script /exec URL (the "connection"). */
function connectionModal() {
  const cur = QRAMS.getApiUrl();
  UI.modal(`
    <div class="modal-header"><h5 class="modal-title"><i class="bi bi-plug me-2"></i>Connection settings</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="small text-secondary">Paste the Web App URL from your Apps Script deployment
        (ends with <code>/exec</code>). It is saved on this device only.</p>
      <input id="apiUrlInput" class="form-control mb-2" placeholder="https://script.google.com/macros/s/…/exec" value="${UI.esc(cur)}">
      <div id="pingResult" class="small"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-secondary" id="pingBtn"><i class="bi bi-wifi me-1"></i>Test</button>
      <button class="btn btn-primary" id="saveApiBtn">Save</button>
    </div>`);
  UI.el('saveApiBtn').onclick = () => {
    QRAMS.setApiUrl(UI.el('apiUrlInput').value);
    UI.toast('Connection saved.'); UI.closeModal();
  };
  UI.el('pingBtn').onclick = async () => {
    QRAMS.setApiUrl(UI.el('apiUrlInput').value);
    UI.el('pingResult').innerHTML = '<span class="spinner-border spinner-border-sm"></span> Testing…';
    try { const p = await Api.ping(); UI.el('pingResult').innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> Connected to ${UI.esc(p.app)} (v${UI.esc(p.version)})</span>`; }
    catch (err) { UI.el('pingResult').innerHTML = `<span class="text-danger"><i class="bi bi-x-circle"></i> ${UI.esc(err.message)}</span>`; }
  };
}

async function loadSchoolName() {
  try { const s = await Api.getSettings(); if (s.schoolName) UI.el('schoolBadge').textContent = s.schoolName; }
  catch (e) {}
}

/* ============================ ROUTER ============================ */
const Router = {
  routes: {
    dashboard: { title: 'Dashboard', render: renderDashboard },
    tasks: { title: 'Tasks', render: renderTasks },
    generator: { title: 'QR Generator', render: renderGenerator },
    students: { title: 'Students', render: renderStudents },
    import: { title: 'Bulk Import', render: renderImport },
    analytics: { title: 'Analytics', render: renderAnalytics },
    settings: { title: 'Settings', render: renderSettings },
  },
  current: null,
  handle() {
    const hash = location.hash.replace(/^#\//, '') || 'dashboard';
    const [name, param] = hash.split('/');
    UI.el('sidebar').classList.remove('open');
    document.querySelectorAll('.sidebar-nav a').forEach(a =>
      a.classList.toggle('active', a.dataset.route === name));
    if (name === 'qr' && param) { UI.el('pageTitle').textContent = 'QR Details'; this.current = ['qr', param]; return renderQRDetail(param); }
    const route = this.routes[name] || this.routes.dashboard;
    UI.el('pageTitle').textContent = route.title;
    this.current = [name, param];
    route.render(param);
  },
  reload() { this.handle(); },
  go(hash) { location.hash = hash; },
};

/* charts we must destroy before re-creating (Chart.js keeps canvases alive). */
const _charts = {};
function chart(id, config) {
  if (_charts[id]) _charts[id].destroy();
  const ctx = UI.el(id);
  if (ctx) _charts[id] = new Chart(ctx, config);
}

/* ========================= DASHBOARD ========================= */
async function renderDashboard() {
  UI.loading('Loading dashboard…');
  try {
    const d = await Api.dashboard();
    const c = d.cards;
    UI.view().innerHTML = `
      <div class="row g-3 mb-3">
        ${statCard('list-check', 'tint-blue', c.totalTasks, 'Total Tasks')}
        ${statCard('qr-code', 'tint-violet', c.activeQR, 'Active QR Codes')}
        ${statCard('check2-circle', 'tint-green', c.completed, 'Completed')}
        ${statCard('clock-history', 'tint-amber', c.overdue, 'Overdue')}
        ${statCard('percent', 'tint-blue', c.completionRate + '%', 'Completion Rate')}
        ${statCard('qr-code-scan', 'tint-rose', c.scansToday, 'Scans Today')}
      </div>
      <div class="row g-3">
        <div class="col-lg-8"><div class="card p-3 h-100">
          <div class="section-head"><h2>Daily scans (7 days)</h2></div>
          <canvas id="dailyChart" height="110"></canvas></div></div>
        <div class="col-lg-4"><div class="card p-3 h-100">
          <div class="section-head"><h2>Progress breakdown</h2></div>
          <canvas id="statusChart" height="160"></canvas></div></div>
        <div class="col-lg-7"><div class="card p-3 h-100">
          <div class="section-head"><h2>Class performance</h2></div>
          <canvas id="classChart" height="150"></canvas></div></div>
        <div class="col-lg-5"><div class="card p-3 h-100">
          <div class="section-head"><h2><i class="bi bi-trophy text-warning me-1"></i>Leaderboard</h2></div>
          ${leaderboardTable(d.leaderboard)}</div></div>
      </div>`;
    drawDashboardCharts(d);
  } catch (err) { UI.error(err.message); }
}

function statCard(icon, tint, value, label) {
  return `<div class="col-6 col-lg-2"><div class="card stat-card">
      <div class="stat-icon ${tint}"><i class="bi bi-${icon}"></i></div>
      <div class="stat-value">${UI.esc(value)}</div>
      <div class="stat-label">${UI.esc(label)}</div></div></div>`;
}

function leaderboardTable(rows) {
  if (!rows.length) return UI.emptyState('trophy', 'No points yet', 'Completions will appear here.');
  return `<div class="table-responsive"><table class="table table-sm mb-0">
    <thead><tr><th>#</th><th>Name</th><th>Class</th><th class="text-end">Done</th><th class="text-end">Points</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${UI.esc(r.label)}</td><td class="small text-secondary">${UI.esc(r.className)}</td>
      <td class="text-end">${r.completed}</td><td class="text-end fw-bold">${r.points}</td></tr>`).join('')}</tbody></table></div>`;
}

function drawDashboardCharts(d) {
  const grid = getComputedStyle(document.body).getPropertyValue('--line') || '#e2e8f0';
  chart('dailyChart', { type: 'line',
    data: { labels: d.daily.map(x => x.date.slice(5)), datasets: [{ label: 'Scans', data: d.daily.map(x => x.count), borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.15)', fill: true, tension: .35 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: grid } }, x: { grid: { display: false } } } } });
  chart('statusChart', { type: 'doughnut',
    data: { labels: d.statusBreakdown.map(s => s.label), datasets: [{ data: d.statusBreakdown.map(s => s.count), backgroundColor: ['#94a3b8', '#38bdf8', '#818cf8', '#f59e0b', '#a78bfa', '#34d399', '#10b981'] }] },
    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } } });
  chart('classChart', { type: 'bar',
    data: { labels: d.classPerformance.map(c => c.className), datasets: [{ label: 'Completion %', data: d.classPerformance.map(c => c.rate), backgroundColor: '#6366f1', borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: grid } }, x: { grid: { display: false } } } } });
}

/* ========================= TASKS ========================= */
let _tasksCache = [], _campaignsCache = [];
async function renderTasks() {
  UI.loading('Loading tasks…');
  try {
    [_tasksCache, _campaignsCache] = await Promise.all([Api.listTasks(), Api.listCampaigns()]);
    const rows = _tasksCache;
    UI.view().innerHTML = `
      <div class="section-head">
        <h2>Tasks</h2>
        <button class="btn btn-primary btn-sm ms-auto" onclick="taskModal()"><i class="bi bi-plus-lg me-1"></i>New Task</button>
      </div>
      ${rows.length ? `<div class="card"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Title</th><th>Subject</th><th>Due</th><th>Mode</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
        <tbody>${rows.map(taskRow).join('')}</tbody></table></div></div>`
      : UI.emptyState('list-check', 'No tasks yet', 'Create your first task, then split it into QR codes.',
          `<button class="btn btn-primary btn-sm" onclick="taskModal()">New Task</button>`)}`;
  } catch (err) { UI.error(err.message); }
}
function taskRow(t) {
  return `<tr>
    <td><div class="fw-semibold">${UI.esc(t.title)}</div><div class="small text-secondary">${UI.esc(t.taskId)}</div></td>
    <td>${UI.esc(t.subject)}</td><td class="small">${UI.date(t.dueDate)}</td>
    <td><span class="badge text-bg-light">${UI.esc(t.completionMode)}</span></td>
    <td>${UI.statusBadge(t.status)}</td>
    <td class="text-end text-nowrap">
      <a class="btn btn-sm btn-outline-primary" href="#/generator/${UI.esc(t.taskId)}" title="Generate QR"><i class="bi bi-qr-code"></i></a>
      <button class="btn btn-sm btn-outline-secondary" onclick="taskModal('${UI.esc(t.taskId)}')" title="Edit"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-secondary" onclick="duplicateTask('${UI.esc(t.taskId)}')" title="Duplicate"><i class="bi bi-files"></i></button>
    </td></tr>`;
}

function taskModal(taskId) {
  const t = taskId ? _tasksCache.find(x => x.taskId === taskId) : {};
  const campOpts = `<option value="">— none —</option>` +
    _campaignsCache.map(c => `<option value="${UI.esc(c.campaignId)}"${c.campaignId === t.campaignId ? ' selected' : ''}>${UI.esc(c.name)}</option>`).join('');
  UI.modal(`
    <div class="modal-header"><h5 class="modal-title">${taskId ? 'Edit' : 'New'} Task</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="taskForm" class="row g-3">
      <div class="col-md-8"><label class="form-label small fw-semibold">Title *</label>
        <input class="form-control" name="title" value="${UI.esc(t.title)}" required></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Subject</label>
        <input class="form-control" name="subject" value="${UI.esc(t.subject)}"></div>
      <div class="col-12"><label class="form-label small fw-semibold">Master Link (URL) *</label>
        <input class="form-control" name="masterLink" type="url" placeholder="https://…" value="${UI.esc(t.masterLink)}" required></div>
      <div class="col-12"><label class="form-label small fw-semibold">Description</label>
        <textarea class="form-control" name="description" rows="2">${UI.esc(t.description)}</textarea></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Campaign</label>
        <select class="form-select" name="campaignId">${campOpts}</select></div>
      <div class="col-md-3"><label class="form-label small fw-semibold">Due date</label>
        <input class="form-control" name="dueDate" type="date" value="${UI.esc((t.dueDate||'').slice(0,10))}"></div>
      <div class="col-md-3"><label class="form-label small fw-semibold">Points</label>
        <input class="form-control" name="pointsValue" type="number" min="0" value="${UI.esc(t.pointsValue || 10)}"></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Teacher</label>
        <input class="form-control" name="teacherName" value="${UI.esc(t.teacherName || (QRAMS.getUser()||{}).name || '')}"></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Completion mode</label>
        <select class="form-select" name="completionMode">${UI.options(QRAMS.ENUMS.completionMode, t.completionMode || 'auto')}</select></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Status</label>
        <select class="form-select" name="status">${UI.options(QRAMS.ENUMS.taskStatus, t.status || 'Active')}</select></div>
    </form></div>
    <div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-primary" id="saveTaskBtn">Save Task</button></div>`);
  UI.el('saveTaskBtn').onclick = async () => {
    const f = UI.el('taskForm');
    if (!f.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(f).entries());
    if (taskId) payload.taskId = taskId;
    try { await Api.saveTask(payload); UI.closeModal(); UI.toast('Task saved.'); renderTasks(); }
    catch (err) { UI.toast(err.message, 'danger'); }
  };
}
async function duplicateTask(id) {
  try { await Api.duplicateTask(id); UI.toast('Task duplicated.'); renderTasks(); }
  catch (err) { UI.toast(err.message, 'danger'); }
}

/* ========================= QR GENERATOR ========================= */
let _genTask = null, _genStudents = [];
async function renderGenerator(preselectTaskId) {
  UI.loading('Loading generator…');
  try {
    const [tasks, students] = await Promise.all([Api.listTasks(), Api.listStudents()]);
    _tasksCache = tasks; _genStudents = students;
    const taskId = preselectTaskId || (tasks[0] && tasks[0].taskId) || '';
    const classes = [...new Set(students.map(s => s.className).filter(Boolean))];
    UI.view().innerHTML = `
      <div class="row g-3">
        <div class="col-lg-4 no-print">
          <div class="card p-3">
            <div class="section-head"><h2>1 · Choose task</h2></div>
            <select class="form-select mb-3" id="genTask">
              ${tasks.map(t => `<option value="${UI.esc(t.taskId)}"${t.taskId === taskId ? ' selected' : ''}>${UI.esc(t.title)}</option>`).join('')}
            </select>
            <div class="section-head"><h2>2 · Choose owners</h2></div>
            <select class="form-select mb-2" id="genType">
              <option value="class">Whole class</option>
              <option value="student">Selected students</option>
              <option value="custom">Custom labels</option>
            </select>
            <div id="genTargetArea" class="mb-3"></div>
            <button class="btn btn-primary w-100" id="genBtn"><i class="bi bi-magic me-1"></i>Generate QR codes</button>
            <p class="small text-secondary mt-2 mb-0">Existing owners are skipped automatically — no duplicates.</p>
          </div>
          <div class="card p-3 mt-3">
            <div class="section-head"><h2><i class="bi bi-palette me-1"></i>Style &amp; export</h2></div>
            <label class="form-label small">QR color</label>
            <input type="color" class="form-control form-control-color mb-2" id="qrColor" value="#0f172a">
            <div class="d-grid gap-2">
              <button class="btn btn-outline-secondary btn-sm" onclick="QRGen.print()"><i class="bi bi-printer me-1"></i>Print sheet</button>
              <button class="btn btn-outline-secondary btn-sm" id="pdfBtn"><i class="bi bi-file-pdf me-1"></i>Download PDF</button>
              <button class="btn btn-outline-secondary btn-sm" id="zipBtn"><i class="bi bi-file-zip me-1"></i>Download ZIP</button>
            </div>
          </div>
        </div>
        <div class="col-lg-8"><div class="card p-3 border-0">
          <div class="section-head no-print"><h2 id="gridTitle">QR codes</h2>
            <span class="badge text-bg-light ms-auto" id="qrCount">0</span></div>
          <div id="qrGridArea"></div>
        </div></div>
      </div>`;

    const typeSel = UI.el('genType');
    const renderTarget = () => {
      const type = typeSel.value;
      const area = UI.el('genTargetArea');
      if (type === 'class') {
        area.innerHTML = `<select class="form-select" id="genClass">${classes.map(c => `<option>${UI.esc(c)}</option>`).join('') || '<option disabled>No classes — import students first</option>'}</select>`;
      } else if (type === 'student') {
        area.innerHTML = `<div class="border rounded p-2" style="max-height:220px;overflow:auto">${
          students.map(s => `<label class="d-block small"><input type="checkbox" class="form-check-input me-2 genStu" value="${UI.esc(s.studentId)}">${UI.esc(s.name)} <span class="text-secondary">${UI.esc(s.className)}</span></label>`).join('') || '<span class="text-secondary small">No students yet.</span>'}</div>`;
      } else {
        area.innerHTML = `<textarea class="form-control" id="genCustom" rows="4" placeholder="One label per line, e.g.&#10;Group A&#10;Reading Corner"></textarea>`;
      }
    };
    typeSel.onchange = renderTarget; renderTarget();
    UI.el('genTask').onchange = () => loadGeneratorGrid();
    UI.el('qrColor').oninput = (e) => { QRGen.brandColor = e.target.value; loadGeneratorGrid(); };
    UI.el('genBtn').onclick = doGenerate;
    UI.el('pdfBtn').onclick = () => _genQRs.length ? QRGen.downloadPdf(_genQRs, _genTask?.title) : UI.toast('Nothing to export', 'warning');
    UI.el('zipBtn').onclick = () => _genQRs.length ? QRGen.downloadZip(_genQRs, _genTask?.title) : UI.toast('Nothing to export', 'warning');
    loadGeneratorGrid();
  } catch (err) { UI.error(err.message); }
}

let _genQRs = [];
async function loadGeneratorGrid() {
  const taskId = UI.el('genTask')?.value;
  if (!taskId) return;
  _genTask = _tasksCache.find(t => t.taskId === taskId);
  UI.el('gridTitle').textContent = 'QR codes · ' + (_genTask ? _genTask.title : '');
  UI.el('qrGridArea').innerHTML = '<div class="spinner-border text-primary"></div>';
  try {
    _genQRs = await Api.listQRCodes(taskId);
    QRGen.renderGrid(UI.el('qrGridArea'), _genQRs, _genTask?.title);
    UI.el('qrCount').textContent = _genQRs.length;
    // clicking a card opens its detail
    UI.el('qrGridArea').querySelectorAll('.qr-card').forEach(card => {
      card.classList.add('cursor-pointer');
      card.onclick = () => Router.go('#/qr/' + card.dataset.token);
    });
  } catch (err) { UI.el('qrGridArea').innerHTML = `<div class="text-danger small">${UI.esc(err.message)}</div>`; }
}

async function doGenerate() {
  const taskId = UI.el('genTask').value;
  const type = UI.el('genType').value;
  const payload = { taskId, entityType: type };
  if (type === 'class') payload.className = UI.el('genClass')?.value;
  else if (type === 'student') payload.entityIds = [...document.querySelectorAll('.genStu:checked')].map(c => c.value);
  else payload.labels = (UI.el('genCustom')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  if ((type === 'student' && !payload.entityIds.length) || (type === 'custom' && !payload.labels.length) || (type === 'class' && !payload.className))
    return UI.toast('Pick at least one owner.', 'warning');

  const btn = UI.el('genBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating…';
  try {
    const r = await Api.generateQRBatch(payload);
    UI.toast(`Created ${r.created} QR code(s)${r.skipped ? ', skipped ' + r.skipped + ' existing' : ''}.`);
    await loadGeneratorGrid();
  } catch (err) { UI.toast(err.message, 'danger'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-magic me-1"></i>Generate QR codes'; }
}

/* ========================= STUDENTS ========================= */
async function renderStudents() {
  UI.loading('Loading students…');
  try {
    const students = await Api.listStudents();
    UI.view().innerHTML = `
      <div class="section-head"><h2>Students</h2>
        <span class="badge text-bg-light">${students.length}</span>
        <a class="btn btn-outline-secondary btn-sm ms-auto" href="#/import"><i class="bi bi-upload me-1"></i>Bulk import</a>
        <button class="btn btn-primary btn-sm" onclick="studentModal()"><i class="bi bi-plus-lg me-1"></i>Add</button></div>
      ${students.length ? `<div class="card"><div class="table-responsive"><table class="table table-hover mb-0">
        <thead><tr><th>ID</th><th>Name</th><th>Class</th><th>Group</th></tr></thead>
        <tbody>${students.map(s => `<tr><td class="small text-secondary">${UI.esc(s.studentId)}</td>
          <td class="fw-semibold">${UI.esc(s.name)}</td><td>${UI.esc(s.className)}</td><td>${UI.esc(s.groupId)}</td></tr>`).join('')}</tbody>
        </table></div></div>`
      : UI.emptyState('people', 'No students', 'Add students individually or import a CSV.',
          `<a class="btn btn-primary btn-sm" href="#/import">Bulk import</a>`)}`;
  } catch (err) { UI.error(err.message); }
}
function studentModal() {
  UI.modal(`<div class="modal-header"><h5 class="modal-title">Add student</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="stuForm" class="row g-3">
      <div class="col-md-7"><label class="form-label small fw-semibold">Name *</label><input class="form-control" name="name" required></div>
      <div class="col-md-5"><label class="form-label small fw-semibold">Class</label><input class="form-control" name="className"></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Student ID (optional)</label><input class="form-control" name="studentId" placeholder="auto"></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Group</label><input class="form-control" name="group"></div>
    </form></div>
    <div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-primary" id="saveStuBtn">Add</button></div>`);
  UI.el('saveStuBtn').onclick = async () => {
    const f = UI.el('stuForm'); if (!f.reportValidity()) return;
    const row = Object.fromEntries(new FormData(f).entries());
    try { await Api.importStudents([row]); UI.closeModal(); UI.toast('Student added.'); renderStudents(); }
    catch (err) { UI.toast(err.message, 'danger'); }
  };
}

/* ========================= BULK IMPORT ========================= */
function renderImport() {
  UI.view().innerHTML = `
    <div class="row g-3"><div class="col-lg-7"><div class="card p-3">
      <div class="section-head"><h2>Bulk import students</h2></div>
      <p class="small text-secondary">Paste CSV or upload a <code>.csv</code> file. Columns (header row):
        <code>name, studentId, className, group, gender, notes</code>. Only <b>name</b> is required.</p>
      <input type="file" class="form-control mb-2" id="csvFile" accept=".csv,text/csv">
      <textarea class="form-control mb-2" id="csvText" rows="9" placeholder="name,studentId,className,group&#10;Ahmad Ali,,3 Cerdik,Group A&#10;Siti,,3 Cerdik,Group B"></textarea>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" id="previewBtn"><i class="bi bi-eye me-1"></i>Preview</button>
        <button class="btn btn-primary btn-sm" id="importBtn"><i class="bi bi-upload me-1"></i>Import</button>
      </div>
    </div></div>
    <div class="col-lg-5"><div class="card p-3"><div class="section-head"><h2>Preview</h2></div>
      <div id="importPreview" class="small text-secondary">Nothing parsed yet.</div></div></div></div>`;

  UI.el('csvFile').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { UI.el('csvText').value = reader.result; previewCsv(); };
    reader.readAsText(file);
  };
  UI.el('previewBtn').onclick = previewCsv;
  UI.el('importBtn').onclick = doImport;
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const obj = {}; headers.forEach((h, i) => obj[h] = (cells[i] || '').trim());
    return obj;
  });
}
function previewCsv() {
  const rows = parseCsv(UI.el('csvText').value);
  const valid = rows.filter(r => r.name);
  UI.el('importPreview').innerHTML = rows.length
    ? `<div class="mb-2"><span class="badge text-bg-success">${valid.length} valid</span>
        ${rows.length - valid.length ? `<span class="badge text-bg-warning ms-1">${rows.length - valid.length} missing name</span>` : ''}</div>
       <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Name</th><th>Class</th><th>Group</th></tr></thead>
       <tbody>${valid.slice(0, 12).map(r => `<tr><td>${UI.esc(r.name)}</td><td>${UI.esc(r.className)}</td><td>${UI.esc(r.group)}</td></tr>`).join('')}</tbody></table></div>
       ${valid.length > 12 ? `<div class="small text-secondary">…and ${valid.length - 12} more</div>` : ''}`
    : '<span class="text-danger">No rows found.</span>';
}
async function doImport() {
  const rows = parseCsv(UI.el('csvText').value).filter(r => r.name);
  if (!rows.length) return UI.toast('Nothing to import.', 'warning');
  try { const r = await Api.importStudents(rows); UI.toast(`Imported ${r.added}, skipped ${r.skipped}.`); Router.go('#/students'); }
  catch (err) { UI.toast(err.message, 'danger'); }
}

/* ========================= ANALYTICS ========================= */
async function renderAnalytics() {
  UI.loading('Crunching analytics…');
  try {
    const d = await Api.dashboard();
    UI.view().innerHTML = `
      <div class="row g-3">
        <div class="col-lg-6"><div class="card p-3"><div class="section-head"><h2>Daily scans</h2></div><canvas id="aDaily" height="120"></canvas></div></div>
        <div class="col-lg-6"><div class="card p-3"><div class="section-head"><h2>Peak scan time (hour of day)</h2></div><canvas id="aHourly" height="120"></canvas></div></div>
        <div class="col-lg-5"><div class="card p-3"><div class="section-head"><h2>Progress</h2></div><canvas id="aStatus" height="170"></canvas></div></div>
        <div class="col-lg-7"><div class="card p-3"><div class="section-head"><h2>Class completion</h2></div><canvas id="aClass" height="170"></canvas></div></div>
        <div class="col-12"><div class="card p-3"><div class="section-head"><h2><i class="bi bi-trophy text-warning me-1"></i>Top performers</h2></div>${leaderboardTable(d.leaderboard)}</div></div>
      </div>`;
    const grid = '#e2e8f0';
    chart('aDaily', { type: 'line', data: { labels: d.daily.map(x => x.date.slice(5)), datasets: [{ data: d.daily.map(x => x.count), borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.15)', fill: true, tension: .35 }] }, options: { plugins: { legend: { display: false } } } });
    chart('aHourly', { type: 'bar', data: { labels: d.hourly.map(h => h.hour), datasets: [{ data: d.hourly.map(h => h.count), backgroundColor: '#f59e0b', borderRadius: 4 }] }, options: { plugins: { legend: { display: false } } } });
    chart('aStatus', { type: 'doughnut', data: { labels: d.statusBreakdown.map(s => s.label), datasets: [{ data: d.statusBreakdown.map(s => s.count), backgroundColor: ['#94a3b8', '#38bdf8', '#818cf8', '#f59e0b', '#a78bfa', '#34d399', '#10b981'] }] }, options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } } });
    chart('aClass', { type: 'bar', data: { labels: d.classPerformance.map(c => c.className), datasets: [{ label: '%', data: d.classPerformance.map(c => c.rate), backgroundColor: '#6366f1', borderRadius: 6 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { max: 100 } } } });
  } catch (err) { UI.error(err.message); }
}

/* ========================= QR DETAIL (Module 7) ========================= */
async function renderQRDetail(token) {
  UI.loading('Loading QR…');
  try {
    const { qr, task, scans } = await Api.getQRDetail(token);
    const url = UI.scanUrl(token);
    UI.view().innerHTML = `
      <a href="#/generator/${UI.esc(qr.taskId)}" class="btn btn-sm btn-ghost mb-2"><i class="bi bi-arrow-left me-1"></i>Back</a>
      <div class="row g-3">
        <div class="col-lg-4"><div class="card p-3 text-center">
          <div class="qr-card border-0"><img src="${QRGen.pngDataUrl(url, 320)}" style="max-width:220px"></div>
          <div class="fw-bold mt-2">${UI.esc(qr.label)}</div>
          <div class="small text-secondary">${UI.esc(qr.entityId)} · ${UI.esc(qr.className || '—')}</div>
          <div class="my-2">${UI.progressPill(qr.progress)} ${UI.statusBadge(qr.status)}</div>
          <button class="btn btn-sm btn-outline-secondary" onclick='QRGen.downloadOne(${JSON.stringify(qr)})'><i class="bi bi-download me-1"></i>PNG</button>
        </div></div>
        <div class="col-lg-8"><div class="card p-3">
          <div class="section-head"><h2>Tracking</h2></div>
          <div class="row g-3 mb-3">
            ${miniStat('Scans', qr.scanCount || 0)}${miniStat('Points', qr.points || 0)}
            ${miniStat('First scan', UI.dateTime(qr.firstScan))}${miniStat('Last scan', UI.dateTime(qr.lastScan))}
          </div>
          <div class="mb-3"><span class="small text-secondary">Task:</span> <b>${UI.esc(task ? task.title : qr.taskId)}</b></div>
          <div class="d-flex flex-wrap gap-2 mb-3">
            <button class="btn btn-sm btn-success" onclick="qrComplete('${UI.esc(token)}')"><i class="bi bi-check2 me-1"></i>Mark complete</button>
            <button class="btn btn-sm btn-outline-secondary" onclick="qrEdit('${UI.esc(token)}')"><i class="bi bi-pencil me-1"></i>Edit</button>
            <button class="btn btn-sm btn-outline-warning" onclick="qrToggle('${UI.esc(token)}','${qr.status === 'Disabled' ? 'Active' : 'Disabled'}')">
              <i class="bi bi-power me-1"></i>${qr.status === 'Disabled' ? 'Enable' : 'Disable'}</button>
            <button class="btn btn-sm btn-outline-danger" onclick="qrRegen('${UI.esc(token)}')"><i class="bi bi-arrow-repeat me-1"></i>Regenerate</button>
          </div>
          <div class="section-head"><h2>Scan history</h2></div>
          ${scans.length ? `<div class="table-responsive"><table class="table table-sm"><thead><tr><th>When</th><th>Device</th></tr></thead>
            <tbody>${scans.map(s => `<tr><td>${UI.dateTime(s.timestamp)}</td><td><span class="badge text-bg-light">${UI.esc(s.deviceType)}</span></td></tr>`).join('')}</tbody></table></div>`
            : '<p class="small text-secondary">No scans yet.</p>'}
        </div></div>
      </div>`;
  } catch (err) { UI.error(err.message); }
}
function miniStat(label, value) {
  return `<div class="col-6 col-md-3"><div class="border rounded p-2 text-center">
    <div class="fw-bold">${UI.esc(value)}</div><div class="small text-secondary">${UI.esc(label)}</div></div></div>`;
}
async function qrComplete(token) { try { await Api.markComplete({ token, method: 'manual', reviewedBy: (QRAMS.getUser() || {}).name }); UI.toast('Marked complete.'); renderQRDetail(token); } catch (e) { UI.toast(e.message, 'danger'); } }
async function qrToggle(token, status) { try { await Api.setQRStatus(token, status); UI.toast('Status updated.'); renderQRDetail(token); } catch (e) { UI.toast(e.message, 'danger'); } }
async function qrRegen(token) {
  if (!confirm('Regenerate this token? The old printed QR will stop working.')) return;
  try { const fresh = await Api.regenerateQR(token); UI.toast('New token created.'); Router.go('#/qr/' + fresh.token); } catch (e) { UI.toast(e.message, 'danger'); }
}
function qrEdit(token) {
  const qr = _genQRs.find(q => q.token === token) || {};
  UI.modal(`<div class="modal-header"><h5 class="modal-title">Edit QR</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="qrEditForm" class="row g-3">
      <div class="col-12"><label class="form-label small fw-semibold">Label</label><input class="form-control" name="label" value="${UI.esc(qr.label)}"></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Progress</label><select class="form-select" name="progress">${UI.options(QRAMS.ENUMS.progress, qr.progress)}</select></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Status</label><select class="form-select" name="status">${UI.options(QRAMS.ENUMS.qrStatus, qr.status)}</select></div>
      <div class="col-12"><label class="form-label small fw-semibold">Remarks</label><textarea class="form-control" name="remarks" rows="2">${UI.esc(qr.remarks)}</textarea></div>
    </form></div>
    <div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="saveQrEdit">Save</button></div>`);
  UI.el('saveQrEdit').onclick = async () => {
    const payload = Object.fromEntries(new FormData(UI.el('qrEditForm')).entries()); payload.token = token;
    try { await Api.updateQR(payload); UI.closeModal(); UI.toast('QR updated.'); renderQRDetail(token); } catch (e) { UI.toast(e.message, 'danger'); }
  };
}

/* ========================= SETTINGS ========================= */
async function renderSettings() {
  let settings = {};
  try { settings = await Api.getSettings(); } catch (e) {}
  const u = QRAMS.getUser() || {};
  UI.view().innerHTML = `
    <div class="row g-3">
      <div class="col-lg-6"><div class="card p-3">
        <div class="section-head"><h2><i class="bi bi-plug me-1"></i>Connection</h2></div>
        <label class="form-label small fw-semibold">Apps Script Web App URL</label>
        <input class="form-control mb-2" id="setApi" value="${UI.esc(QRAMS.getApiUrl())}">
        <div class="d-flex gap-2"><button class="btn btn-outline-secondary btn-sm" id="setPing">Test</button>
          <button class="btn btn-primary btn-sm" id="setApiSave">Save URL</button></div>
        <div id="setPingResult" class="small mt-2"></div>
      </div></div>
      <div class="col-lg-6"><div class="card p-3">
        <div class="section-head"><h2><i class="bi bi-sliders me-1"></i>Preferences</h2></div>
        <label class="form-label small fw-semibold">School name</label>
        <div class="input-group mb-3"><input class="form-control" id="setSchool" value="${UI.esc(settings.schoolName || '')}">
          <button class="btn btn-outline-primary" id="setSchoolSave">Save</button></div>
        <div class="form-check form-switch mb-2">
          <input class="form-check-input" type="checkbox" id="setGamify" ${settings.gamificationEnabled === 'true' ? 'checked' : ''}>
          <label class="form-check-label" for="setGamify">Enable gamification (points &amp; leaderboard) <span class="badge text-bg-light">Phase 2</span></label>
        </div>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="setTheme" ${document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'checked' : ''}>
          <label class="form-check-label" for="setTheme">Dark mode</label>
        </div>
      </div></div>
      <div class="col-lg-6"><div class="card p-3">
        <div class="section-head"><h2><i class="bi bi-person me-1"></i>Account</h2></div>
        <p class="mb-1"><b>${UI.esc(u.name)}</b></p>
        <p class="small text-secondary mb-1">${UI.esc(u.email)} · role: ${UI.esc(u.role)}</p>
        <button class="btn btn-outline-danger btn-sm mt-2" onclick="doLogout()"><i class="bi bi-box-arrow-right me-1"></i>Sign out</button>
      </div></div>
      <div class="col-lg-6"><div class="card p-3">
        <div class="section-head"><h2><i class="bi bi-info-circle me-1"></i>About</h2></div>
        <p class="small text-secondary mb-0">QRAMS v1.0 · Phase 1. Campaigns, gamification, badges and certificates
          are scaffolded in the database and unlock in Phase 2 — no rebuild needed.</p>
      </div></div>
    </div>`;
  UI.el('setApiSave').onclick = () => { QRAMS.setApiUrl(UI.el('setApi').value); UI.toast('Saved.'); };
  UI.el('setPing').onclick = async () => {
    QRAMS.setApiUrl(UI.el('setApi').value);
    UI.el('setPingResult').innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try { const p = await Api.ping(); UI.el('setPingResult').innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> ${UI.esc(p.app)} v${UI.esc(p.version)}</span>`; }
    catch (e) { UI.el('setPingResult').innerHTML = `<span class="text-danger">${UI.esc(e.message)}</span>`; }
  };
  UI.el('setSchoolSave').onclick = async () => {
    try { await Api.saveSetting('schoolName', UI.el('setSchool').value); UI.el('schoolBadge').textContent = UI.el('setSchool').value; UI.toast('School name saved.'); }
    catch (e) { UI.toast(e.message, 'danger'); }
  };
  UI.el('setGamify').onchange = async (e) => { try { await Api.saveSetting('gamificationEnabled', e.target.checked ? 'true' : 'false'); UI.toast('Saved.'); } catch (err) { UI.toast(err.message, 'danger'); } };
  UI.el('setTheme').onchange = toggleTheme;
}
