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

const THEMES = ['matrix', 'light', 'dark']; // cycle order (Matrix is the default look)
function initTheme() { applyTheme(localStorage.getItem(QRAMS.KEYS.THEME) || 'matrix'); }

/* Apply a theme. 'matrix' = Bootstrap's dark base + a green skin + the rain animation. */
function applyTheme(t) {
  const html = document.documentElement;
  if (t === 'matrix') {
    html.setAttribute('data-bs-theme', 'dark');
    html.classList.add('matrix');
    if (window.MatrixRain) MatrixRain.start();
  } else {
    html.setAttribute('data-bs-theme', t);
    html.classList.remove('matrix');
    if (window.MatrixRain) MatrixRain.stop();
  }
  localStorage.setItem(QRAMS.KEYS.THEME, t);
  updateThemeIcon(t);
}
function toggleTheme() {
  const cur = localStorage.getItem(QRAMS.KEYS.THEME) || 'matrix';
  applyTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
}
function updateThemeIcon(t) {
  const i = document.querySelector('#themeBtn i');
  if (i) i.className = t === 'matrix' ? 'bi bi-terminal-fill' : (t === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars');
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
  applyGamificationNav();
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
  try {
    const s = await Api.getSettings();
    if (s.schoolName) UI.el('schoolBadge').textContent = s.schoolName;
    QRAMS.setGamify(s.gamificationEnabled === 'true');
    // One-time: tell the backend its own public URL so hosted-quiz score callbacks work.
    const u = QRAMS.getApiUrl();
    if (u && s.execUrl !== u && ((QRAMS.getUser() || {}).role === 'admin')) Api.saveSetting('execUrl', u).catch(() => {});
  } catch (e) {}
  applyGamificationNav();
}

/* Show or hide the gamification menu items based on the saved setting. */
function applyGamificationNav() {
  document.body.classList.toggle('gami-on', QRAMS.getGamify());
}

/* ============================ ROUTER ============================ */
const Router = {
  routes: {
    dashboard: { title: 'Dashboard', render: renderDashboard },
    campaigns: { title: 'Campaigns', render: renderCampaigns },
    tasks: { title: 'Tasks', render: renderTasks },
    generator: { title: 'QR Generator', render: renderGenerator },
    students: { title: 'Students', render: renderStudents },
    import: { title: 'Bulk Import', render: renderImport },
    analytics: { title: 'Analytics', render: renderAnalytics },
    leaderboard: { title: 'Leaderboard', render: renderLeaderboard },
    rewards: { title: 'Rewards & Badges', render: renderRewards },
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
    if (name === 'campaign' && param) { UI.el('pageTitle').textContent = 'Campaign'; this.current = ['campaign', param]; return renderCampaignDetail(param); }
    if (name === 'cert' && param) { UI.el('pageTitle').textContent = 'Certificate'; this.current = ['cert', param]; return renderCertificate(param); }
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
      <button class="btn btn-sm btn-outline-danger" onclick="delTask('${UI.esc(t.taskId)}')" title="Delete"><i class="bi bi-trash"></i></button>
    </td></tr>`;
}

async function taskModal(taskId) {
  const t = taskId ? (_tasksCache.find(x => x.taskId === taskId) || {}) : {};
  const campOpts = `<option value="">— none —</option>` +
    _campaignsCache.map(c => `<option value="${UI.esc(c.campaignId)}"${c.campaignId === t.campaignId ? ' selected' : ''}>${UI.esc(c.name)}</option>`).join('');
  const appType = ['quiz', 'hosted', 'link'].includes(t.appType) ? t.appType : (taskId ? 'link' : 'quiz');

  // Prompt for the ADVANCED hosted-HTML mode (paste into any AI).
  const aiHtmlPrompt = 'Create ONE self-contained HTML file (HTML + CSS + JavaScript, no external libraries or CDNs) for a short quiz on [TOPIC] for [YEAR/LEVEL] pupils. Show one question at a time, then a final score screen. CRITICAL: when the quiz finishes, call the global function qramsDone(score, total) exactly once — for example qramsDone(8, 10). Do not add any login, submit button to a server, or anything else. Output only the HTML file.';

  // Load existing content when editing.
  let quizHtml = '';
  _quizDraft = [emptyQuestion()];
  if (taskId && appType === 'hosted') { try { quizHtml = (await Api.getTaskApp(taskId)).html || ''; } catch (e) {} }
  if (taskId && appType === 'quiz') {
    try {
      const qs = await Api.getQuiz(taskId);
      if (qs.length) _quizDraft = qs.map(q => ({ q: q.question, options: [...q.options, '', '', ''].slice(0, 4), correct: q.correct || 'A' }));
    } catch (e) {}
  }

  UI.modal(`
    <div class="modal-header"><h5 class="modal-title">${taskId ? 'Edit' : 'New'} Task</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="taskForm" class="row g-3">
      <div class="col-md-8"><label class="form-label small fw-semibold">Title *</label>
        <input class="form-control" name="title" value="${UI.esc(t.title)}" required></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Subject</label>
        <input class="form-control" name="subject" value="${UI.esc(t.subject)}"></div>

      <div class="col-12"><label class="form-label small fw-semibold">Task type</label>
        <select class="form-select" name="appType" id="taskAppType">
          <option value="quiz"${appType === 'quiz' ? ' selected' : ''}>Built-in quiz — QRAMS makes &amp; marks it (recommended)</option>
          <option value="link"${appType === 'link' ? ' selected' : ''}>External link (Google Form, website, …)</option>
          <option value="hosted"${appType === 'hosted' ? ' selected' : ''}>Hosted HTML app (advanced — paste AI code)</option>
        </select></div>

      <div class="col-12 d-none" id="builderArea">
        <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <label class="form-label small fw-semibold mb-0">Questions</label>
          <span class="badge text-bg-light" id="qbCount">0</span>
          <div class="btn-group ms-auto">
            <button type="button" class="btn btn-sm btn-success" id="qbSnapBtn" title="Take a photo of the exam paper"><i class="bi bi-camera me-1"></i>Snap paper</button>
            <button type="button" class="btn btn-sm btn-outline-success" id="qbUploadBtn" title="Upload photos or a PDF of the exam paper"><i class="bi bi-image me-1"></i>Upload</button>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="qbAiBtn"><i class="bi bi-stars me-1"></i>Paste from AI</button>
          <button type="button" class="btn btn-sm btn-primary" id="qbAddBtn"><i class="bi bi-plus-lg me-1"></i>Add question</button>
          <input type="file" id="qbFile" accept="image/*,application/pdf" multiple class="d-none">
          <input type="file" id="qbCam" accept="image/*" capture="environment" class="d-none">
        </div>
        <div class="d-none border rounded p-2 mb-2" id="qbAiArea">
          <p class="small text-secondary mb-1">1) Copy the prompt → 2) paste into Gemini / ChatGPT / Claude → 3) paste the AI's reply below → 4) Parse.
            <br><i class="bi bi-lightbulb me-1"></i><b>Tip:</b> you can also attach a photo/PDF of an exam paper in the AI chat — it will extract the questions from it.</p>
          <button type="button" class="btn btn-sm btn-outline-secondary mb-2" id="qbCopyPrompt"><i class="bi bi-clipboard me-1"></i>Copy question prompt</button>
          <textarea class="form-control form-control-sm font-monospace mb-2" id="qbAiText" rows="5" placeholder='[{"q":"…","options":["…","…","…","…"],"correct":1}]'></textarea>
          <button type="button" class="btn btn-sm btn-success" id="qbParseBtn"><i class="bi bi-magic me-1"></i>Parse &amp; add</button>
        </div>
        <div id="qbList"></div>
        <div class="form-text">Tick the circle beside the correct answer. Options C and D may be left empty.</div>
      </div>

      <div class="col-12" id="linkArea">
        <label class="form-label small fw-semibold">Master link (URL)</label>
        <input class="form-control" name="masterLink" type="url" placeholder="https://…" value="${UI.esc(t.masterLink)}">
        <div class="form-text">QRAMS adds <code>?qid=&lt;token&gt;</code> to this link so the task can report a score back (optional).</div>
      </div>

      <div class="col-12 d-none" id="quizArea">
        <div class="d-flex align-items-center gap-2 mb-1">
          <label class="form-label small fw-semibold mb-0">Quiz HTML</label>
          <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="copyPromptBtn"><i class="bi bi-clipboard me-1"></i>Copy AI prompt</button>
        </div>
        <textarea class="form-control font-monospace" id="quizHtml" rows="8" placeholder="&lt;!doctype html&gt; … your quiz that calls qramsDone(score, total) when done …">${UI.esc(quizHtml)}</textarea>
        <div class="form-text">Generate a quiz with any AI (use the prompt button), paste it here, and it must call <code>qramsDone(score, total)</code> when finished. Max ~49,000 characters.</div>
      </div>

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

  // Show the right fields for the chosen task type.
  const typeSel = UI.el('taskAppType');
  const syncType = () => {
    const v = typeSel.value;
    UI.el('builderArea').classList.toggle('d-none', v !== 'quiz');
    UI.el('quizArea').classList.toggle('d-none', v !== 'hosted');
    UI.el('linkArea').classList.toggle('d-none', v !== 'link');
    // Quiz-style tasks complete when the SCORE arrives, not on scan — avoid 'auto'.
    const cm = UI.el('taskForm').elements['completionMode'];
    if ((v === 'quiz' || v === 'hosted') && cm && cm.value === 'auto') cm.value = 'quiz';
    if (v === 'quiz') qbRender();
  };
  typeSel.onchange = syncType; syncType();

  UI.el('copyPromptBtn').onclick = () => copyText(aiHtmlPrompt);
  UI.el('qbCopyPrompt').onclick = () => copyText(QB_AI_PROMPT);
  UI.el('qbAddBtn').onclick = () => { _quizDraft.push(emptyQuestion()); qbRender(); };
  UI.el('qbAiBtn').onclick = () => UI.el('qbAiArea').classList.toggle('d-none');
  UI.el('qbParseBtn').onclick = qbParseAI;
  UI.el('qbSnapBtn').onclick = () => UI.el('qbCam').click();   // opens the phone camera directly
  UI.el('qbUploadBtn').onclick = () => UI.el('qbFile').click(); // gallery / files (multi-select)
  const onPickPaper = (e) => { if (e.target.files.length) qbUploadPaper([...e.target.files]); e.target.value = ''; };
  UI.el('qbFile').onchange = onPickPaper;
  UI.el('qbCam').onchange = onPickPaper;

  UI.el('saveTaskBtn').onclick = async () => {
    const f = UI.el('taskForm');
    if (!f.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(f).entries());
    const html = (UI.el('quizHtml')?.value || '');
    if (taskId) payload.taskId = taskId;
    let questions = [];
    if (payload.appType === 'quiz') {
      questions = qbCollect();
      if (!questions.length) return UI.toast('Add at least one complete question (text + options A and B).', 'warning');
    }
    if (payload.appType === 'hosted' && !html.trim()) return UI.toast('Paste the quiz HTML (or switch task type).', 'warning');
    if (payload.appType === 'link' && !(payload.masterLink || '').trim()) return UI.toast('Enter a master link (or switch task type).', 'warning');
    const btn = UI.el('saveTaskBtn'); btn.disabled = true;
    try {
      const saved = await Api.saveTask(payload);
      const id = (saved && saved.taskId) || taskId;
      if (payload.appType === 'hosted') await Api.saveTaskApp(id, html);
      if (payload.appType === 'quiz') await Api.saveQuiz(id, questions);
      UI.closeModal(); UI.toast('Task saved.'); renderTasks();
    } catch (err) { UI.toast(err.message, 'danger'); btn.disabled = false; }
  };
}

/* ---------------- Built-in quiz builder (used inside taskModal) ----------------
   _quizDraft holds the questions being edited: [{q, options:[A,B,C,D], correct:'A'}].
   The small qb* functions below are global because the builder's inputs use
   inline handlers (the modal is re-rendered HTML, not a framework component). */
let _quizDraft = [];
const QB_LETTERS = ['A', 'B', 'C', 'D'];
const QB_AI_PROMPT = 'If a file (exam paper) is attached, extract its multiple-choice questions and work out the correct answers; otherwise write 5 multiple-choice questions on [TOPIC] for [YEAR/LEVEL] pupils in [LANGUAGE]. Keep each question short and clear. Output ONLY a JSON array in exactly this format, with no other text: [{"q":"question text","options":["first option","second option","third option","fourth option"],"correct":1}] — "correct" is the position of the right option, counting from 1.';

function emptyQuestion() { return { q: '', options: ['', '', '', ''], correct: 'A' }; }

function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text)
    .then(() => UI.toast('Prompt copied — paste it into Gemini / ChatGPT / Claude.'))
    .catch(() => UI.toast('Copy failed — select and copy manually.', 'warning'));
  else UI.toast('Clipboard not available here.', 'warning');
}

/** Redraw the question cards from _quizDraft. */
function qbRender() {
  const list = UI.el('qbList');
  if (!list) return;
  UI.el('qbCount').textContent = _quizDraft.length;
  list.innerHTML = _quizDraft.map((q, i) => `
    <div class="border rounded p-2 mb-2">
      <div class="d-flex gap-2 align-items-start mb-2">
        <span class="badge text-bg-light mt-1">Q${i + 1}</span>
        <textarea class="form-control form-control-sm" rows="2" placeholder="Question text"
          oninput="qbSetQ(${i}, this.value)">${UI.esc(q.q)}</textarea>
        <button type="button" class="btn btn-sm btn-outline-danger" title="Remove question" onclick="qbDel(${i})"><i class="bi bi-trash"></i></button>
      </div>
      ${QB_LETTERS.map((L, j) => `
        <div class="input-group input-group-sm mb-1">
          <label class="input-group-text" title="Mark as the correct answer">
            <input type="radio" class="form-check-input mt-0 me-1" name="qbCorrect${i}"
              ${q.correct === L ? 'checked' : ''} onchange="qbSetCorrect(${i}, '${L}')"> ${L}
          </label>
          <input class="form-control" value="${UI.esc(q.options[j])}"
            placeholder="Option ${L}${j > 1 ? ' (optional)' : ''}" oninput="qbSetOpt(${i}, ${j}, this.value)">
        </div>`).join('')}
    </div>`).join('');
}
function qbSetQ(i, v) { _quizDraft[i].q = v; }
function qbSetOpt(i, j, v) { _quizDraft[i].options[j] = v; }
function qbSetCorrect(i, l) { _quizDraft[i].correct = l; }
function qbDel(i) { _quizDraft.splice(i, 1); if (!_quizDraft.length) _quizDraft.push(emptyQuestion()); qbRender(); }

/** Collect only complete questions for saving. */
function qbCollect() {
  return _quizDraft
    .map(q => ({ q: q.q.trim(), options: q.options.map(o => o.trim()), correct: q.correct || 'A' }))
    .filter(q => q.q && q.options[0] && q.options[1] && q.options[QB_LETTERS.indexOf(q.correct)]);
}

/** Parse an AI reply (JSON preferred, simple "Q:/A)" text as fallback). */
function qbParseAI() {
  const raw = (UI.el('qbAiText').value || '').trim();
  if (!raw) return UI.toast('Paste the AI reply first.', 'warning');
  let parsed = [];

  // 1) JSON — find the [...] block even if wrapped in ``` fences or prose.
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        parsed = arr.map(x => {
          const opts = (x.options || x.opts || []).map(o => String(o)).slice(0, 4);
          let letter = 'A';
          const c = x.correct;
          if (typeof c === 'string' && /^[A-Da-d]$/.test(c.trim())) letter = c.trim().toUpperCase();
          else {
            const n = Number(c);
            letter = QB_LETTERS[(n >= 1 && n <= opts.length) ? n - 1 : (n >= 0 && n < opts.length ? n : 0)] || 'A';
          }
          return { q: String(x.q || x.question || ''), options: [...opts, '', '', ''].slice(0, 4), correct: letter };
        }).filter(x => x.q && x.options[0] && x.options[1]);
      }
    } catch (e) { /* fall through to text parsing */ }
  }

  // 2) Plain text — "Q: …" / "1. …" lines with "A) …" options; * marks the correct one.
  if (!parsed.length) {
    let cur = null;
    raw.split(/\r?\n/).forEach(line => {
      const l = line.trim();
      if (!l) return;
      const om = l.match(/^(\*?)\s*([A-Da-d])[).:-]\s*(.+)$/);
      if (om && cur) {
        const idx = QB_LETTERS.indexOf(om[2].toUpperCase());
        cur.options[idx] = om[3].trim();
        if (om[1] === '*') cur.correct = om[2].toUpperCase();
      } else {
        cur = { q: l.replace(/^(Q\d*|Soalan\s*\d*|\d+)[).:]?\s*/i, ''), options: ['', '', '', ''], correct: 'A' };
        parsed.push(cur);
      }
    });
    parsed = parsed.filter(x => x.q && x.options[0] && x.options[1]);
  }

  if (!parsed.length) return UI.toast('Could not read any questions — check the format.', 'warning');
  const blank = _quizDraft.length === 1 && !_quizDraft[0].q && !_quizDraft[0].options.join('');
  _quizDraft = blank ? parsed : _quizDraft.concat(parsed);
  UI.el('qbAiText').value = '';
  UI.el('qbAiArea').classList.add('d-none');
  qbRender();
  UI.toast(`Added ${parsed.length} question(s) — please double-check the correct answers!`);
}

/* ------------- Upload an exam paper → AI extracts the questions ------------- */

/** Shrink a photo before upload (faster on school wifi, better OCR). Returns base64 JPEG. */
function shrinkImage(file, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = URL.createObjectURL(file);
  });
}

/** Read a file as raw base64 (used for PDFs). */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

/** Send the exam paper (camera snap, photo(s) or a PDF) to the AI and drop the
    questions into the builder. Multiple photos are read together as ONE paper. */
async function qbUploadPaper(files) {
  const snapBtn = UI.el('qbSnapBtn'), upBtn = UI.el('qbUploadBtn');
  const setBusy = (busy) => {
    if (snapBtn) { snapBtn.disabled = busy; snapBtn.innerHTML = busy ? '<span class="spinner-border spinner-border-sm me-1"></span>Reading…' : '<i class="bi bi-camera me-1"></i>Snap paper'; }
    if (upBtn) upBtn.disabled = busy;
  };
  try {
    files = [...files];
    let payload;
    const pdf = files.find(f => f.type === 'application/pdf');
    if (pdf) {
      if (files.length > 1) return UI.toast('Upload a PDF on its own (or pick photos only).', 'warning');
      if (pdf.size > 8 * 1024 * 1024) return UI.toast('PDF too big (max 8 MB) — photo the pages instead.', 'warning');
      payload = { file: await fileToBase64(pdf), mime: 'application/pdf' };
    } else {
      const imgs = files.filter(f => f.type.startsWith('image/')).slice(0, 6);
      if (!imgs.length) return UI.toast('Please choose photos (JPG/PNG) or a PDF.', 'warning');
      setBusy(true); // shrinking several photos can take a moment
      const pages = [];
      for (const f of imgs) pages.push({ data: await shrinkImage(f), mime: 'image/jpeg' });
      // One photo uses the simple shape (works on older backends); 2+ pages need the newer backend.
      payload = pages.length === 1 ? { file: pages[0].data, mime: 'image/jpeg' } : { files: pages };
    }

    setBusy(true);
    const r = await Api.extractQuiz(payload);

    const parsed = r.questions.map(q => ({
      q: q.question, options: [...q.options, '', '', ''].slice(0, 4), correct: q.correct || 'A',
    }));
    const blank = _quizDraft.length === 1 && !_quizDraft[0].q && !_quizDraft[0].options.join('');
    _quizDraft = blank ? parsed : _quizDraft.concat(parsed);
    qbRender();
    UI.toast(`Added ${parsed.length} question(s) — CHECK the ticked answers! Snap the next page to add more.`, 'warning');
  } catch (err) {
    UI.toast(err.message, 'danger');
  } finally {
    setBusy(false);
  }
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
    const [tasks, students, groups] = await Promise.all([Api.listTasks(), Api.listStudents(), Api.listGroups()]);
    _tasksCache = tasks; _genStudents = students; _groupsCache = groups;
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
              <option value="group">Students in a group</option>
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
      } else if (type === 'group') {
        area.innerHTML = `<select class="form-select" id="genGroup">${groups.length ? groups.map(g => `<option value="${UI.esc(g.groupId)}">${UI.esc(g.name)}</option>`).join('') : '<option value="" disabled>No groups — create them on the Students page</option>'}</select>`;
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
  else if (type === 'group') payload.groupId = UI.el('genGroup')?.value;
  else if (type === 'student') payload.entityIds = [...document.querySelectorAll('.genStu:checked')].map(c => c.value);
  else payload.labels = (UI.el('genCustom')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  if ((type === 'student' && !payload.entityIds.length) || (type === 'custom' && !payload.labels.length) || (type === 'class' && !payload.className) || (type === 'group' && !payload.groupId))
    return UI.toast('Pick at least one owner.', 'warning');

  const btn = UI.el('genBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating…';
  try {
    const r = await Api.generateQRBatch(payload);
    UI.toast(`Created ${r.created} QR code(s)${r.skipped ? ', skipped ' + r.skipped + ' existing' : ''}.`);
    await loadGeneratorGrid();
  } catch (err) { UI.toast(err.message, 'danger'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-magic me-1"></i>Generate QR codes'; }
}

/* ========================= STUDENTS & GROUPS ========================= */
let _studentsCache = [], _groupsCache = [];

/* <option> list of groups, with the given one pre-selected. */
function groupOptions(selected) {
  return `<option value="">— No group —</option>` +
    _groupsCache.map(g => `<option value="${UI.esc(g.groupId)}"${g.groupId === selected ? ' selected' : ''}>${UI.esc(g.name)}</option>`).join('');
}

async function renderStudents() {
  UI.loading('Loading students…');
  try {
    const [students, groups] = await Promise.all([Api.listStudents(), Api.listGroups()]);
    _studentsCache = students; _groupsCache = groups;
    const count = {}; students.forEach(s => { if (s.groupId) count[s.groupId] = (count[s.groupId] || 0) + 1; });

    UI.view().innerHTML = `
      <div class="section-head"><h2>Students</h2><span class="badge text-bg-light">${students.length}</span>
        <button class="btn btn-outline-secondary btn-sm ms-auto" onclick="groupModal()"><i class="bi bi-collection me-1"></i>New Group</button>
        <a class="btn btn-outline-secondary btn-sm" href="#/import"><i class="bi bi-upload me-1"></i>Bulk import</a>
        <button class="btn btn-primary btn-sm" onclick="studentModal()"><i class="bi bi-plus-lg me-1"></i>Add</button></div>

      <div class="card p-3 mb-3">
        <div class="d-flex align-items-center flex-wrap gap-2">
          <span class="small fw-semibold me-1"><i class="bi bi-people me-1"></i>Groups</span>
          ${groups.length ? groups.map(g => `<span class="badge-chip cursor-pointer" title="Edit group" onclick="groupModal('${UI.esc(g.groupId)}')">${UI.esc(g.name)} <span class="badge text-bg-light">${count[g.groupId] || 0}</span></span>`).join('')
            : '<span class="small text-secondary">No groups yet — create one to give different tasks to different ability levels.</span>'}
        </div>
      </div>

      ${students.length ? `<div class="card">
        <div class="p-2 px-3 border-bottom d-flex align-items-center gap-2 flex-wrap">
          <span class="small text-secondary"><b id="selCount">0</b> selected</span>
          <select class="form-select form-select-sm" id="bulkGroup" style="max-width:210px">${groupOptions('')}</select>
          <button class="btn btn-sm btn-primary" id="bulkAssignBtn"><i class="bi bi-people-fill me-1"></i>Assign selected</button>
          <button class="btn btn-sm btn-outline-danger ms-auto" id="bulkDeleteBtn"><i class="bi bi-trash me-1"></i>Delete selected</button>
        </div>
        <div class="table-responsive"><table class="table table-hover align-middle mb-0">
          <thead><tr><th style="width:34px"><input type="checkbox" class="form-check-input" id="selAll" title="Select all"></th>
            <th>Name</th><th>Class</th><th style="min-width:150px">Group</th><th class="text-end">Actions</th></tr></thead>
          <tbody>${students.map(s => `<tr>
            <td><input type="checkbox" class="form-check-input selStu" value="${UI.esc(s.studentId)}"></td>
            <td><div class="fw-semibold">${UI.esc(s.name)}</div><div class="small text-secondary">${UI.esc(s.studentId)}</div></td>
            <td>${UI.esc(s.className)}</td>
            <td><select class="form-select form-select-sm rowGroup" data-id="${UI.esc(s.studentId)}">${groupOptions(s.groupId)}</select></td>
            <td class="text-end"><button class="btn btn-sm btn-outline-danger" onclick="delStudent('${UI.esc(s.studentId)}')" title="Delete"><i class="bi bi-trash"></i></button></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`
      : UI.emptyState('people', 'No students', 'Add students individually or import a CSV.',
          `<a class="btn btn-primary btn-sm" href="#/import">Bulk import</a>`)}`;

    // Selection helpers
    const updateCount = () => { const n = document.querySelectorAll('.selStu:checked').length; const el = UI.el('selCount'); if (el) el.textContent = n; };
    document.querySelectorAll('.selStu').forEach(cb => cb.onchange = updateCount);
    if (UI.el('selAll')) UI.el('selAll').onchange = (e) => { document.querySelectorAll('.selStu').forEach(cb => { cb.checked = e.target.checked; }); updateCount(); };

    // Single assign (per-row dropdown)
    document.querySelectorAll('.rowGroup').forEach(sel => sel.onchange = async (e) => {
      try { await Api.assignGroup([e.target.dataset.id], e.target.value); UI.toast('Group updated.'); renderStudents(); }
      catch (err) { UI.toast(err.message, 'danger'); }
    });

    // Bulk assign (checked rows -> chosen group)
    if (UI.el('bulkAssignBtn')) UI.el('bulkAssignBtn').onclick = async () => {
      const ids = [...document.querySelectorAll('.selStu:checked')].map(c => c.value);
      if (!ids.length) return UI.toast('Tick at least one student first.', 'warning');
      try { const r = await Api.assignGroup(ids, UI.el('bulkGroup').value); UI.toast(`Assigned ${r.assigned} student(s).`); renderStudents(); }
      catch (err) { UI.toast(err.message, 'danger'); }
    };

    // Bulk delete (checked rows)
    if (UI.el('bulkDeleteBtn')) UI.el('bulkDeleteBtn').onclick = async () => {
      const ids = [...document.querySelectorAll('.selStu:checked')].map(c => c.value);
      if (!ids.length) return UI.toast('Tick at least one student first.', 'warning');
      if (!confirm('Delete ' + ids.length + ' selected student(s)?\n\nThis cannot be undone.')) return;
      try { const r = await Api.deleteStudents(ids); UI.toast(`Deleted ${r.deleted} student(s).`); renderStudents(); }
      catch (err) { UI.toast(err.message, 'danger'); }
    };
  } catch (err) { UI.error(err.message); }
}

/* Add a student — just name + class; the ID is generated automatically. */
function studentModal() {
  UI.modal(`<div class="modal-header"><h5 class="modal-title">Add student</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="stuForm" class="row g-3">
      <div class="col-md-7"><label class="form-label small fw-semibold">Name *</label><input class="form-control" name="name" required></div>
      <div class="col-md-5"><label class="form-label small fw-semibold">Class</label><input class="form-control" name="className" placeholder="e.g. 3 Cerdik"></div>
    </form><p class="small text-secondary mt-2 mb-0">An ID is assigned automatically. Put students into groups afterwards from the table.</p></div>
    <div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-primary" id="saveStuBtn">Add</button></div>`);
  UI.el('saveStuBtn').onclick = async () => {
    const f = UI.el('stuForm'); if (!f.reportValidity()) return;
    const row = Object.fromEntries(new FormData(f).entries());
    try { await Api.importStudents([row]); UI.closeModal(); UI.toast('Student added.'); renderStudents(); }
    catch (err) { UI.toast(err.message, 'danger'); }
  };
}

/* Create / rename / delete a group. */
function groupModal(id) {
  const g = id ? (_groupsCache.find(x => x.groupId === id) || {}) : {};
  const classes = [...new Set(_studentsCache.map(s => s.className).filter(Boolean))];
  UI.modal(`<div class="modal-header"><h5 class="modal-title">${id ? 'Edit' : 'New'} Group</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="grpForm" class="row g-3">
      <div class="col-12"><label class="form-label small fw-semibold">Group name *</label>
        <input class="form-control" name="name" value="${UI.esc(g.name)}" placeholder="e.g. Advanced, Support, Group A" required></div>
      <div class="col-12"><label class="form-label small fw-semibold">Class (optional)</label>
        <input class="form-control" name="className" list="grpClasses" value="${UI.esc(g.className)}">
        <datalist id="grpClasses">${classes.map(c => `<option value="${UI.esc(c)}">`).join('')}</datalist></div>
    </form><p class="small text-secondary mt-2 mb-0">Groups let you give different-level tasks to different abilities. Assign students from the table (single dropdown or tick + bulk).</p></div>
    <div class="modal-footer">${id ? `<button class="btn btn-outline-danger me-auto" onclick="delGroup('${UI.esc(id)}')"><i class="bi bi-trash me-1"></i>Delete</button>` : ''}
      <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-primary" id="saveGrpBtn">Save</button></div>`);
  UI.el('saveGrpBtn').onclick = async () => {
    const f = UI.el('grpForm'); if (!f.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(f).entries()); if (id) payload.groupId = id;
    try { await Api.saveGroup(payload); UI.closeModal(); UI.toast('Group saved.'); renderStudents(); }
    catch (err) { UI.toast(err.message, 'danger'); }
  };
}
async function delGroup(id) {
  if (!confirm('Delete this group?\n\nStudents in it simply become ungrouped (they are not deleted).')) return;
  try { await Api.deleteGroup(id); UI.closeModal(); UI.toast('Group deleted.'); renderStudents(); }
  catch (e) { UI.toast(e.message, 'danger'); }
}

/* ========================= BULK IMPORT ========================= */
function renderImport() {
  UI.view().innerHTML = `
    <div class="row g-3"><div class="col-lg-7"><div class="card p-3">
      <div class="section-head"><h2>Bulk import students</h2></div>
      <p class="small text-secondary">Paste CSV or upload a <code>.csv</code> file. You only need two columns (header row):
        <code>name, className</code>. IDs are generated automatically, and you can sort pupils into groups afterwards on the Students page.</p>
      <input type="file" class="form-control mb-2" id="csvFile" accept=".csv,text/csv">
      <textarea class="form-control mb-2" id="csvText" rows="9" placeholder="name,className&#10;Ahmad bin Ali,3 Cerdik&#10;Siti Nurhaliza,3 Cerdik&#10;Mei Ling,3 Bijak"></textarea>
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
       <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Name</th><th>Class</th></tr></thead>
       <tbody>${valid.slice(0, 12).map(r => `<tr><td>${UI.esc(r.name)}</td><td>${UI.esc(r.className)}</td></tr>`).join('')}</tbody></table></div>
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
            ${miniStat('Score', qr.maxScore ? ((qr.score || 0) + ' / ' + qr.maxScore) : '—')}
            ${miniStat('First scan', UI.dateTime(qr.firstScan))}${miniStat('Last scan', UI.dateTime(qr.lastScan))}
          </div>
          <div class="mb-3"><span class="small text-secondary">Task:</span> <b>${UI.esc(task ? task.title : qr.taskId)}</b></div>
          <div class="d-flex flex-wrap gap-2 mb-3">
            <button class="btn btn-sm btn-success" onclick="qrComplete('${UI.esc(token)}')"><i class="bi bi-check2 me-1"></i>Mark complete</button>
            <button class="btn btn-sm btn-outline-secondary" onclick="qrEdit('${UI.esc(token)}')"><i class="bi bi-pencil me-1"></i>Edit</button>
            <button class="btn btn-sm btn-outline-warning" onclick="qrToggle('${UI.esc(token)}','${qr.status === 'Disabled' ? 'Active' : 'Disabled'}')">
              <i class="bi bi-power me-1"></i>${qr.status === 'Disabled' ? 'Enable' : 'Disable'}</button>
            <button class="btn btn-sm btn-outline-danger" onclick="qrRegen('${UI.esc(token)}')"><i class="bi bi-arrow-repeat me-1"></i>Regenerate</button>
            <button class="btn btn-sm btn-outline-info" onclick="issueCertModal(${UI.esc(JSON.stringify({ scope: 'task', scopeId: qr.taskId, entityId: qr.entityId, entityName: qr.label }))})"><i class="bi bi-patch-check me-1"></i>Certificate</button>
            <button class="btn btn-sm btn-outline-danger" onclick="delQR('${UI.esc(token)}','${UI.esc(qr.taskId)}')"><i class="bi bi-trash me-1"></i>Delete</button>
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
          <label class="form-check-label" for="setGamify">Enable gamification — points, badges, leaderboard &amp; rewards</label>
        </div>
        <label class="form-label small fw-semibold mt-2">Theme</label>
        <select class="form-select" id="setThemeSelect">
          <option value="matrix">Matrix (animated rain)</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
        ${(u.role === 'admin') ? `
        <label class="form-label small fw-semibold mt-3">Gemini AI key <span class="text-secondary">(for “Upload exam paper”)</span></label>
        <div class="input-group">
          <input type="password" class="form-control" id="setGemKey" placeholder="paste your free key…">
          <button class="btn btn-outline-primary" id="setGemKeySave">Save</button>
        </div>
        <div class="form-text" id="gemKeyStatus">Checking…</div>` : ''}
      </div></div>
      <div class="col-lg-6"><div class="card p-3">
        <div class="section-head"><h2><i class="bi bi-person me-1"></i>Account</h2></div>
        <p class="mb-1"><b>${UI.esc(u.name)}</b></p>
        <p class="small text-secondary mb-1">${UI.esc(u.email)} · role: ${UI.esc(u.role)}</p>
        <button class="btn btn-outline-danger btn-sm mt-2" onclick="doLogout()"><i class="bi bi-box-arrow-right me-1"></i>Sign out</button>
      </div></div>
      <div class="col-lg-6"><div class="card p-3">
        <div class="section-head"><h2><i class="bi bi-info-circle me-1"></i>About</h2></div>
        <p class="small text-secondary mb-0">QRAMS v1.0 · Phase 2. Campaigns, gamification (points, badges,
          leaderboard, rewards) and QR-verifiable certificates are active. Toggle gamification above to
          show or hide those menus.</p>
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
  UI.el('setGamify').onchange = async (e) => {
    try {
      await Api.saveSetting('gamificationEnabled', e.target.checked ? 'true' : 'false');
      QRAMS.setGamify(e.target.checked); applyGamificationNav();
      UI.toast(e.target.checked ? 'Gamification ON — Leaderboard & Rewards added to the menu.' : 'Gamification off.');
    } catch (err) { UI.toast(err.message, 'danger'); }
  };
  const themeSel = UI.el('setThemeSelect');
  if (themeSel) { themeSel.value = localStorage.getItem(QRAMS.KEYS.THEME) || 'matrix'; themeSel.onchange = (e) => applyTheme(e.target.value); }

  // Gemini key (admin only): status + save. The key itself never comes back to the browser.
  if (UI.el('setGemKeySave')) {
    const showKeyStatus = async () => {
      try {
        const r = await Api.hasGeminiKey();
        UI.el('gemKeyStatus').innerHTML = r.set
          ? '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Key saved — “Upload exam paper” is ready.</span>'
          : 'Not set — get a free key at <b>aistudio.google.com</b> (sign in → Get API key), then paste it here.';
      } catch (e) { UI.el('gemKeyStatus').textContent = ''; }
    };
    showKeyStatus();
    UI.el('setGemKeySave').onclick = async () => {
      try {
        await Api.saveGeminiKey(UI.el('setGemKey').value.trim());
        UI.el('setGemKey').value = '';
        UI.toast('AI key saved.');
        showKeyStatus();
      } catch (e) { UI.toast(e.message, 'danger'); }
    };
  }
}

/* =======================================================================
   PHASE 2 — CAMPAIGNS · LEADERBOARD · REWARDS · BADGES · CERTIFICATES
   ======================================================================= */

/* ------------------------------ CAMPAIGNS ------------------------------ */
let _campaignList = [];
async function renderCampaigns() {
  UI.loading('Loading campaigns…');
  try {
    const [camps, tasks, qrs] = await Promise.all([Api.listCampaigns(), Api.listTasks(), Api.listQRCodes()]);
    _campaignList = camps;

    // Roll up tasks + QR completion per campaign (one pass each).
    const campOfTask = {}; tasks.forEach(t => { campOfTask[t.taskId] = t.campaignId || ''; });
    const stat = {}; camps.forEach(c => { stat[c.campaignId] = { tasks: 0, qr: 0, done: 0, rate: 0 }; });
    tasks.forEach(t => { if (stat[t.campaignId]) stat[t.campaignId].tasks++; });
    qrs.forEach(q => { const cid = campOfTask[q.taskId]; if (stat[cid]) { stat[cid].qr++; if (q.progress === 'Completed') stat[cid].done++; } });
    Object.keys(stat).forEach(k => { const s = stat[k]; s.rate = s.qr ? Math.round(s.done / s.qr * 100) : 0; });

    const activeCount = camps.filter(c => c.status === 'Active').length;
    const totalQr = qrs.length, totalDone = qrs.filter(q => q.progress === 'Completed').length;
    const overallRate = totalQr ? Math.round(totalDone / totalQr * 100) : 0;

    UI.view().innerHTML = `
      <div class="section-head"><h2>Campaigns</h2>
        <button class="btn btn-primary btn-sm ms-auto" onclick="campaignModal()"><i class="bi bi-plus-lg me-1"></i>New Campaign</button></div>
      <div class="row g-3">
        ${miniStatCard('collection', 'tint-violet', camps.length, 'Campaigns')}
        ${miniStatCard('play-circle', 'tint-green', activeCount, 'Active')}
        ${miniStatCard('list-check', 'tint-blue', tasks.length, 'Total Tasks')}
        ${miniStatCard('percent', 'tint-amber', overallRate + '%', 'Avg Completion')}
      </div>
      <div class="section-head mt-4"><h2 class="h6 text-secondary mb-0">All campaigns</h2></div>
      ${camps.length
        ? `<div class="row g-3">${camps.map(c => campaignCard(c, stat[c.campaignId])).join('')}</div>`
        : UI.emptyState('collection', 'No campaigns yet', 'Group related tasks under a campaign (e.g. “English Week”).',
            `<button class="btn btn-primary btn-sm" onclick="campaignModal()">New Campaign</button>`)}`;
  } catch (err) { UI.error(err.message); }
}
function miniStatCard(icon, tint, value, label) {
  return `<div class="col-6 col-md-3"><div class="card stat-card">
    <div class="stat-icon ${tint}"><i class="bi bi-${icon}"></i></div>
    <div class="stat-value">${UI.esc(value)}</div><div class="stat-label">${UI.esc(label)}</div></div></div>`;
}
function campaignCard(c, st) {
  st = st || { tasks: 0, qr: 0, done: 0, rate: 0 };
  return `<div class="col-md-6 col-xl-4"><div class="card p-3 h-100 cursor-pointer" onclick="Router.go('#/campaign/${UI.esc(c.campaignId)}')">
    <div class="d-flex align-items-start gap-2 mb-2">
      <div class="stat-icon tint-violet"><i class="bi bi-collection"></i></div>
      <div class="flex-fill"><div class="fw-bold">${UI.esc(c.name)}</div>
        <div class="small text-secondary">${UI.esc(c.subject || '—')}</div></div>
      ${UI.statusBadge(c.status)}
    </div>
    <p class="small text-secondary mb-2">${UI.esc((c.description || '').slice(0, 80)) || 'No description'}</p>
    <div class="d-flex flex-wrap gap-3 small mb-2">
      <span><i class="bi bi-list-check me-1"></i>${st.tasks} tasks</span>
      <span><i class="bi bi-qr-code me-1"></i>${st.qr} QR</span>
      <span><i class="bi bi-check2-circle me-1"></i>${st.done} done</span>
    </div>
    <div class="progress" style="height:6px;background:rgba(127,255,166,.12)"><div class="progress-bar bg-success" style="width:${st.rate}%"></div></div>
    <div class="d-flex justify-content-between small text-secondary mt-1">
      <span><i class="bi bi-calendar3 me-1"></i>${UI.date(c.startDate)} → ${UI.date(c.endDate)}</span>
      <span class="fw-semibold">${st.rate}%</span>
    </div>
  </div></div>`;
}
function campaignModal(id) {
  const c = id ? (_campaignList.find(x => x.campaignId === id) || {}) : {};
  UI.modal(`
    <div class="modal-header"><h5 class="modal-title">${id ? 'Edit' : 'New'} Campaign</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="campForm" class="row g-3">
      <div class="col-md-8"><label class="form-label small fw-semibold">Name *</label>
        <input class="form-control" name="name" value="${UI.esc(c.name)}" required></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Status</label>
        <select class="form-select" name="status">${UI.options(['Draft', 'Active', 'Paused', 'Completed', 'Archived'], c.status || 'Active')}</select></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Subject</label>
        <input class="form-control" name="subject" value="${UI.esc(c.subject)}"></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Program</label>
        <input class="form-control" name="program" value="${UI.esc(c.program)}"></div>
      <div class="col-12"><label class="form-label small fw-semibold">Description</label>
        <textarea class="form-control" name="description" rows="2">${UI.esc(c.description)}</textarea></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Start date</label>
        <input class="form-control" name="startDate" type="date" value="${UI.esc((c.startDate || '').slice(0, 10))}"></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">End date</label>
        <input class="form-control" name="endDate" type="date" value="${UI.esc((c.endDate || '').slice(0, 10))}"></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Teacher in charge</label>
        <input class="form-control" name="teacherInCharge" value="${UI.esc(c.teacherInCharge || (QRAMS.getUser() || {}).name || '')}"></div>
    </form></div>
    <div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-primary" id="saveCampBtn">Save</button></div>`);
  UI.el('saveCampBtn').onclick = async () => {
    const f = UI.el('campForm'); if (!f.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(f).entries());
    if (id) payload.campaignId = id;
    try { await Api.saveCampaign(payload); UI.closeModal(); UI.toast('Campaign saved.'); renderCampaigns(); }
    catch (err) { UI.toast(err.message, 'danger'); }
  };
}

async function renderCampaignDetail(id) {
  UI.loading('Loading campaign…');
  try {
    const [c, certs] = await Promise.all([Api.getCampaign(id), Api.listCertificates(id).catch(() => [])]);
    const s = c.stats || {};
    UI.view().innerHTML = `
      <a href="#/campaigns" class="btn btn-sm btn-ghost mb-2"><i class="bi bi-arrow-left me-1"></i>Campaigns</a>
      <div class="section-head"><h2>${UI.esc(c.name)}</h2> ${UI.statusBadge(c.status)}
        <button class="btn btn-sm btn-outline-secondary ms-auto" onclick="campaignModal('${UI.esc(c.campaignId)}')"><i class="bi bi-pencil me-1"></i>Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="delCampaign('${UI.esc(c.campaignId)}')"><i class="bi bi-trash me-1"></i>Delete</button></div>
      <div class="row g-3 mb-3">
        ${statCard('list-check', 'tint-blue', s.tasks || 0, 'Tasks')}
        ${statCard('qr-code', 'tint-violet', s.qrCodes || 0, 'QR Codes')}
        ${statCard('check2-circle', 'tint-green', s.completed || 0, 'Completed')}
        ${statCard('percent', 'tint-amber', (s.completionRate || 0) + '%', 'Completion')}
      </div>
      <div class="row g-3">
        <div class="col-lg-7"><div class="card p-3">
          <div class="section-head"><h2>Tasks in this campaign</h2></div>
          ${(c.tasks && c.tasks.length)
            ? `<div class="table-responsive"><table class="table table-sm table-hover mb-0"><tbody>${c.tasks.map(t => `<tr>
                <td><a href="#/generator/${UI.esc(t.taskId)}" class="fw-semibold text-decoration-none">${UI.esc(t.title)}</a>
                  <div class="small text-secondary">${UI.esc(t.subject || '')}</div></td>
                <td class="text-end">${UI.statusBadge(t.status)}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="small text-secondary mb-0">No tasks yet. Create a task and set its Campaign to this one.</p>'}
        </div></div>
        <div class="col-lg-5"><div class="card p-3">
          <div class="section-head"><h2><i class="bi bi-patch-check me-1"></i>Certificates</h2>
            <button class="btn btn-sm btn-primary ms-auto" title="Issue certificate"
              onclick="issueCertModal(${UI.esc(JSON.stringify({ scope: 'campaign', scopeId: c.campaignId }))})"><i class="bi bi-plus-lg"></i></button></div>
          ${certs.length ? `<div class="list-group list-group-flush">${certs.map(certRow).join('')}</div>`
            : '<p class="small text-secondary mb-0">None issued yet. Click + to award one.</p>'}
        </div></div>
      </div>`;
  } catch (err) { UI.error(err.message); }
}
function certRow(c) {
  const valid = c.status === 'Valid';
  return `<div class="list-group-item d-flex align-items-center gap-2 px-0">
    <div class="flex-fill"><div class="fw-semibold">${UI.esc(c.entityName)}</div>
      <div class="small text-secondary">${UI.esc(c.certId)} · ${UI.date(c.issuedAt)}</div></div>
    ${valid ? `<a class="btn btn-sm btn-outline-primary" href="#/cert/${UI.esc(c.token)}" title="Open / print"><i class="bi bi-printer"></i></a>`
      : '<span class="badge text-bg-danger">Revoked</span>'}
  </div>`;
}

/* ------------------------------ LEADERBOARD ------------------------------ */
async function renderLeaderboard() {
  if (!QRAMS.getGamify()) return gamificationOffNotice('Leaderboard');
  UI.loading('Loading leaderboard…');
  try {
    const [board, students] = await Promise.all([Api.leaderboard(), Api.listStudents()]);
    const classes = [...new Set(students.map(s => s.className).filter(Boolean))];
    UI.view().innerHTML = `
      <div class="section-head"><h2><i class="bi bi-trophy text-warning me-1"></i>Leaderboard</h2>
        <select class="form-select form-select-sm ms-auto" id="lbClass" style="max-width:200px">
          <option value="">All classes</option>${classes.map(c => `<option>${UI.esc(c)}</option>`).join('')}</select></div>
      <div class="card p-0" id="lbCard">${leaderboardFull(board)}</div>`;
    UI.el('lbClass').onchange = async (e) => {
      UI.el('lbCard').innerHTML = '<div class="p-4 text-center"><div class="spinner-border text-primary"></div></div>';
      try { UI.el('lbCard').innerHTML = leaderboardFull(await Api.leaderboard(e.target.value)); }
      catch (err) { UI.el('lbCard').innerHTML = `<div class="p-3 text-danger small">${UI.esc(err.message)}</div>`; }
    };
  } catch (err) { UI.error(err.message); }
}
function leaderboardFull(rows) {
  if (!rows.length) return UI.emptyState('trophy', 'No points yet', 'Points are earned when pupils complete tasks.');
  const medal = ['🥇', '🥈', '🥉'];
  return `<div class="table-responsive"><table class="table table-hover align-middle mb-0">
    <thead><tr><th>#</th><th>Name</th><th>Class</th><th class="text-center">Badges</th><th class="text-end">Done</th><th class="text-end">Points</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      <td class="lb-rank">${i < 3 ? medal[i] : (i + 1)}</td>
      <td class="fw-semibold">${UI.esc(r.label)}</td>
      <td class="small text-secondary">${UI.esc(r.className)}</td>
      <td class="text-center">${r.badges ? `<span class="badge text-bg-light">${r.badges} <i class="bi bi-award"></i></span>` : '—'}</td>
      <td class="text-end">${r.completed}</td>
      <td class="text-end pts">${r.points}</td></tr>`).join('')}</tbody></table></div>`;
}
function gamificationOffNotice(feature) {
  UI.view().innerHTML = UI.emptyState('toggle-off', feature + ' is switched off',
    'Turn on gamification in Settings to use points, badges, the leaderboard and rewards.',
    `<a class="btn btn-primary btn-sm" href="#/settings">Open Settings</a>`);
}

/* --------------------------- REWARDS & BADGES --------------------------- */
let _rewardsCache = [], _badgesCache = [];
async function renderRewards() {
  if (!QRAMS.getGamify()) return gamificationOffNotice('Rewards & Badges');
  UI.loading('Loading rewards & badges…');
  try {
    const [rewards, badges, students] = await Promise.all([Api.listRewards(), Api.listBadges(), Api.listStudents()]);
    _rewardsCache = rewards; _badgesCache = badges; _genStudents = students;
    UI.view().innerHTML = `
      <div class="row g-3">
        <div class="col-lg-7"><div class="card p-3">
          <div class="section-head"><h2><i class="bi bi-gift me-1"></i>Rewards</h2>
            <button class="btn btn-sm btn-primary ms-auto" onclick="rewardModal()"><i class="bi bi-plus-lg me-1"></i>New</button></div>
          ${rewards.length ? `<div class="row g-2">${rewards.map(rewardCard).join('')}</div>` : '<p class="small text-secondary mb-0">No rewards yet.</p>'}
        </div></div>
        <div class="col-lg-5"><div class="card p-3">
          <div class="section-head"><h2><i class="bi bi-coin me-1"></i>Redeem points</h2></div>
          <label class="form-label small fw-semibold">Pupil</label>
          <select class="form-select mb-2" id="redeemStu">${students.map(s => `<option value="${UI.esc(s.studentId)}">${UI.esc(s.name)} · ${UI.esc(s.className)}</option>`).join('') || '<option disabled>No students</option>'}</select>
          <div id="redeemBalance" class="small text-secondary mb-2"></div>
          <label class="form-label small fw-semibold">Reward</label>
          <select class="form-select mb-3" id="redeemReward">${rewards.filter(r => r.status !== 'Disabled').map(r => `<option value="${UI.esc(r.rewardId)}">${UI.esc(r.name)} — ${r.cost} pts</option>`).join('')}</select>
          <button class="btn btn-primary w-100" id="redeemBtn"><i class="bi bi-bag-check me-1"></i>Redeem</button>
        </div></div>
        <div class="col-12"><div class="card p-3">
          <div class="section-head"><h2><i class="bi bi-award me-1"></i>Badges</h2>
            <button class="btn btn-sm btn-outline-primary ms-auto" onclick="badgeModal()"><i class="bi bi-plus-lg me-1"></i>New badge</button></div>
          <div class="d-flex flex-wrap">${badges.map(badgeAdminChip).join('') || '<span class="small text-secondary">No badges defined.</span>'}</div>
          <p class="small text-secondary mt-2 mb-0">Badges are awarded automatically when a pupil meets the rule — e.g.
            <code>first_scan</code>, <code>tasks:5</code>, <code>points:100</code>, <code>perfect_campaign</code>.</p>
        </div></div>
      </div>`;
    const showBalance = async () => {
      const id = UI.el('redeemStu').value; if (!id) return;
      UI.el('redeemBalance').textContent = 'Checking balance…';
      try { const r = await Api.getStudentPoints(id); UI.el('redeemBalance').innerHTML = `Balance: <span class="pts">${r.points}</span> pts`; }
      catch (e) { UI.el('redeemBalance').textContent = ''; }
    };
    UI.el('redeemStu').onchange = showBalance; showBalance();
    UI.el('redeemBtn').onclick = doRedeem;
  } catch (err) { UI.error(err.message); }
}
function rewardCard(r) {
  return `<div class="col-sm-6"><div class="border rounded p-2 h-100">
    <div class="d-flex justify-content-between"><span class="fw-semibold">${UI.esc(r.name)}</span><span class="pts">${r.cost}</span></div>
    <div class="small text-secondary">${UI.esc(r.description || '')}</div>
    <div class="mt-1"><span class="badge text-bg-light">${UI.esc(r.type)}</span>
      ${r.status === 'Disabled' ? '<span class="badge text-bg-secondary ms-1">off</span>' : ''}
      <button class="btn btn-sm btn-link p-0 ms-2" onclick="rewardModal('${UI.esc(r.rewardId)}')">Edit</button></div>
  </div></div>`;
}
function badgeAdminChip(b) {
  return `<span class="badge-chip cursor-pointer" title="${UI.esc(b.description)}" onclick="badgeModal('${UI.esc(b.badgeId)}')">
    <span class="ico">${UI.esc(b.icon || '🏅')}</span> ${UI.esc(b.name)} <code>${UI.esc(b.criteria)}</code></span>`;
}
async function doRedeem() {
  const entityId = UI.el('redeemStu').value, rewardId = UI.el('redeemReward').value;
  if (!entityId || !rewardId) return UI.toast('Pick a pupil and a reward.', 'warning');
  const btn = UI.el('redeemBtn'); btn.disabled = true;
  try { const r = await Api.redeemReward({ entityId, rewardId }); UI.toast(`Redeemed “${r.reward}”. New balance: ${r.balance} pts.`); renderRewards(); }
  catch (e) { UI.toast(e.message, 'danger'); btn.disabled = false; }
}
function rewardModal(id) {
  const r = id ? (_rewardsCache.find(x => x.rewardId === id) || {}) : {};
  UI.modal(`<div class="modal-header"><h5 class="modal-title">${id ? 'Edit' : 'New'} Reward</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="rewardForm" class="row g-3">
      <div class="col-md-8"><label class="form-label small fw-semibold">Name *</label><input class="form-control" name="name" value="${UI.esc(r.name)}" required></div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Cost (pts)</label><input class="form-control" type="number" min="0" name="cost" value="${UI.esc(r.cost || 10)}"></div>
      <div class="col-12"><label class="form-label small fw-semibold">Description</label><input class="form-control" name="description" value="${UI.esc(r.description)}"></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Type</label><select class="form-select" name="type">${UI.options(QRAMS.ENUMS.rewardType, r.type || 'item')}</select></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Status</label><select class="form-select" name="status">${UI.options(['Active', 'Disabled'], r.status || 'Active')}</select></div>
    </form></div>
    <div class="modal-footer">${id ? `<button class="btn btn-outline-danger me-auto" onclick="delReward('${UI.esc(id)}')"><i class="bi bi-trash me-1"></i>Delete</button>` : ''}<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="saveRewardBtn">Save</button></div>`);
  UI.el('saveRewardBtn').onclick = async () => {
    const f = UI.el('rewardForm'); if (!f.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(f).entries()); if (id) payload.rewardId = id;
    try { await Api.saveReward(payload); UI.closeModal(); UI.toast('Reward saved.'); renderRewards(); } catch (e) { UI.toast(e.message, 'danger'); }
  };
}
function badgeModal(id) {
  const b = id ? (_badgesCache.find(x => x.badgeId === id) || {}) : {};
  UI.modal(`<div class="modal-header"><h5 class="modal-title">${id ? 'Edit' : 'New'} Badge</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="badgeForm" class="row g-3">
      <div class="col-md-3"><label class="form-label small fw-semibold">Icon</label><input class="form-control text-center" name="icon" value="${UI.esc(b.icon || '🏅')}" maxlength="2"></div>
      <div class="col-md-9"><label class="form-label small fw-semibold">Name *</label><input class="form-control" name="name" value="${UI.esc(b.name)}" required></div>
      <div class="col-12"><label class="form-label small fw-semibold">Description</label><input class="form-control" name="description" value="${UI.esc(b.description)}"></div>
      <div class="col-12"><label class="form-label small fw-semibold">Rule (criteria)</label>
        <input class="form-control" name="criteria" value="${UI.esc(b.criteria)}" placeholder="tasks:5">
        <div class="form-text"><code>first_scan</code> · <code>tasks:N</code> · <code>points:N</code> · <code>perfect_campaign</code></div></div>
    </form></div>
    <div class="modal-footer">${id ? `<button class="btn btn-outline-danger me-auto" onclick="delBadge('${UI.esc(id)}')"><i class="bi bi-trash me-1"></i>Delete</button>` : ''}<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="saveBadgeBtn">Save</button></div>`);
  UI.el('saveBadgeBtn').onclick = async () => {
    const f = UI.el('badgeForm'); if (!f.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(f).entries()); if (id) payload.badgeId = id;
    try { await Api.saveBadge(payload); UI.closeModal(); UI.toast('Badge saved.'); renderRewards(); } catch (e) { UI.toast(e.message, 'danger'); }
  };
}

/* ------------------------------ CERTIFICATES ------------------------------ */
async function issueCertModal(opts) {
  opts = opts || {};
  const haveNamed = opts.entityId && opts.entityName;
  let students = _genStudents;
  if (!haveNamed && !students.length) { try { students = _genStudents = await Api.listStudents(); } catch (e) {} }
  const stuOptions = (students || []).map(s => `<option value="${UI.esc(s.studentId)}"${s.studentId === opts.entityId ? ' selected' : ''}>${UI.esc(s.name)} · ${UI.esc(s.className)}</option>`).join('');
  UI.modal(`<div class="modal-header"><h5 class="modal-title"><i class="bi bi-patch-check me-2"></i>Issue certificate</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><form id="certForm" class="row g-3">
      <div class="col-12"><label class="form-label small fw-semibold">Pupil *</label>
        ${haveNamed
          ? `<input class="form-control" value="${UI.esc(opts.entityName)}" readonly><input type="hidden" name="entityId" value="${UI.esc(opts.entityId)}"><input type="hidden" name="entityName" value="${UI.esc(opts.entityName)}">`
          : `<select class="form-select" name="entityId" required>${stuOptions || '<option value="" disabled selected>No students loaded</option>'}</select>`}</div>
      <div class="col-12"><label class="form-label small fw-semibold">Title (optional)</label>
        <input class="form-control" name="title" placeholder="Auto-filled from the ${UI.esc(opts.scope || 'task')} if left blank"></div>
    </form></div>
    <div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-primary" id="issueCertBtn">Issue &amp; open</button></div>`);
  UI.el('issueCertBtn').onclick = async () => {
    const f = UI.el('certForm'); if (!f.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(f).entries());
    payload.scope = opts.scope || 'task'; payload.scopeId = opts.scopeId || '';
    payload.issuedBy = (QRAMS.getUser() || {}).name || '';
    try { const cert = await Api.issueCertificate(payload); UI.closeModal(); UI.toast('Certificate issued.'); Router.go('#/cert/' + cert.token); }
    catch (e) { UI.toast(e.message, 'danger'); }
  };
}

async function renderCertificate(token) {
  UI.loading('Loading certificate…');
  try {
    const cert = await Api.getCertificate(token);
    if (!cert) throw new Error('Certificate not found.');
    const school = (UI.el('schoolBadge') || {}).textContent || 'Our School';
    const verifyUrl = QRAMS.getApiUrl() + '?cert=' + encodeURIComponent(cert.token);
    const revoked = cert.status !== 'Valid';
    UI.view().innerHTML = `
      <div class="no-print mb-3 d-flex gap-2 align-items-center">
        <button class="btn btn-sm btn-ghost" onclick="history.back()"><i class="bi bi-arrow-left me-1"></i>Back</button>
        <button class="btn btn-sm btn-primary ms-auto" onclick="window.print()"><i class="bi bi-printer me-1"></i>Print / Save PDF</button>
        ${revoked ? '' : `<button class="btn btn-sm btn-outline-danger" onclick="revokeCert('${UI.esc(cert.token)}')"><i class="bi bi-x-octagon me-1"></i>Revoke</button>`}
      </div>
      ${revoked ? '<div class="alert alert-danger no-print">This certificate has been revoked — its verify QR now shows “not valid”.</div>' : ''}
      <div class="certificate"><div class="cert-frame">
        <div class="cert-title">Certificate of Achievement</div>
        <div class="cert-sub mt-3">This is proudly presented to</div>
        <div class="cert-name">${UI.esc(cert.entityName)}</div>
        <div class="cert-sub">${UI.esc(cert.title)}</div>
        <div class="cert-foot">
          <div class="text-start"><div class="cert-sign">${UI.esc(cert.issuedBy || 'Teacher')}<div class="small">Issued ${UI.date(cert.issuedAt)}</div></div></div>
          <div class="cert-qr text-center"><img src="${QRGen.pngDataUrl(verifyUrl, 180)}" alt="verify">
            <div class="text-muted" style="font-size:.6rem">Scan to verify · ${UI.esc(cert.certId)}</div></div>
          <div class="text-end"><div class="cert-sign">${UI.esc(school)}<div class="small">${UI.esc(cert.scope)} award</div></div></div>
        </div>
      </div></div>`;
  } catch (err) { UI.error(err.message); }
}
async function revokeCert(token) {
  if (!confirm('Revoke this certificate? Its verify QR will then show “not valid”.')) return;
  try { await Api.revokeCertificate(token); UI.toast('Certificate revoked.'); renderCertificate(token); }
  catch (e) { UI.toast(e.message, 'danger'); }
}

/* =========================== DELETE HANDLERS ===========================
   Each asks for confirmation first (destructive, cannot be undone). */
async function delTask(taskId) {
  const t = _tasksCache.find(x => x.taskId === taskId) || {};
  if (!confirm('Delete "' + (t.title || taskId) + '"?\n\nThis also removes ALL its QR codes and scan history, and cannot be undone.')) return;
  try { const r = await Api.deleteTask(taskId); UI.toast('Task deleted' + (r.qrCodes ? ' (' + r.qrCodes + ' QR codes removed)' : '') + '.'); renderTasks(); }
  catch (e) { UI.toast(e.message, 'danger'); }
}
async function delStudent(studentId) {
  const s = _studentsCache.find(x => x.studentId === studentId) || {};
  if (!confirm('Remove student "' + (s.name || studentId) + '"?')) return;
  try { await Api.deleteStudent(studentId); UI.toast('Student removed.'); renderStudents(); }
  catch (e) { UI.toast(e.message, 'danger'); }
}
async function delQR(token, taskId) {
  if (!confirm('Delete this QR code and its scan history?\n\nThe printed code will stop working. This cannot be undone.')) return;
  try { await Api.deleteQR(token); UI.toast('QR code deleted.'); Router.go('#/generator/' + (taskId || '')); }
  catch (e) { UI.toast(e.message, 'danger'); }
}
async function delCampaign(campaignId) {
  if (!confirm('Delete this campaign?\n\nIts tasks are kept (just un-grouped). This cannot be undone.')) return;
  try { await Api.deleteCampaign(campaignId); UI.toast('Campaign deleted.'); Router.go('#/campaigns'); }
  catch (e) { UI.toast(e.message, 'danger'); }
}
async function delBadge(badgeId) {
  if (!confirm('Delete this badge?\n\nPupils who earned it will lose the record. This cannot be undone.')) return;
  try { await Api.deleteBadge(badgeId); UI.closeModal(); UI.toast('Badge deleted.'); renderRewards(); }
  catch (e) { UI.toast(e.message, 'danger'); }
}
async function delReward(rewardId) {
  if (!confirm('Delete this reward?\n\nThis cannot be undone.')) return;
  try { await Api.deleteReward(rewardId); UI.closeModal(); UI.toast('Reward deleted.'); renderRewards(); }
  catch (e) { UI.toast(e.message, 'danger'); }
}
