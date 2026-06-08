/**
 * Code.gs  — ENTRY POINT / ROUTER
 * =============================================================================
 * Google Apps Script calls doGet() for GET requests and doPost() for POST.
 * Everything funnels through here, then dispatches to Api.gs / Auth.gs.
 *
 * TWO JOBS for doGet:
 *   A) SCAN REDIRECT  — when a phone opens  ...?id=<token>
 *        We log the scan and bounce the pupil to the master link. Returns HTML.
 *   B) READ API       — when the frontend calls ...?action=<name>
 *        Returns JSON.
 *
 * doPost = the WRITE API (create/update). The frontend sends JSON as plain text
 * (Content-Type: text/plain) so the browser does NOT fire a CORS preflight that
 * GAS can't answer. We parse the body ourselves.
 * =============================================================================
 */

/* ------------------------------- doGet ------------------------------- */
function doGet(e) {
  var p = (e && e.parameter) || {};

  // A) SCAN: a QR was opened. p.id is the token.
  if (p.id) {
    var ua = (e.parameter['ua']) || ''; // phones can't send UA here; best-effort
    var dest = handleScan(p.id, ua);
    return redirectPage(dest);
  }

  // B) READ API
  try {
    var action = p.action || 'ping';
    var data = routeGet(action, p);
    return jsonOk(data);
  } catch (err) {
    return jsonErr(err.message || String(err));
  }
}

/** GET actions are reads. Most require a valid session token (p.token). */
function routeGet(action, p) {
  switch (action) {
    case 'ping':
      return { app: CONFIG.APP_NAME, version: CONFIG.VERSION, time: nowIso() };

    // Reads allowed for any signed-in role (admin/teacher/viewer).
    case 'dashboard':      requireRole(p.token, CONFIG.ROLES); return getDashboard();
    case 'listCampaigns':  requireRole(p.token, CONFIG.ROLES); return listCampaigns();
    case 'listTasks':      requireRole(p.token, CONFIG.ROLES); return listTasks();
    case 'getTask':        requireRole(p.token, CONFIG.ROLES); return getTask(p.taskId);
    case 'listStudents':   requireRole(p.token, CONFIG.ROLES); return listStudents();
    case 'listGroups':     requireRole(p.token, CONFIG.ROLES); return listGroups();
    case 'listQRCodes':    requireRole(p.token, CONFIG.ROLES); return listQRCodes(p.taskId);
    case 'getQR':          requireRole(p.token, CONFIG.ROLES); return getQR(p.qrToken);
    case 'getQRDetail':    requireRole(p.token, CONFIG.ROLES); return getQRDetail(p.qrToken);
    case 'getSettings':    requireRole(p.token, CONFIG.ROLES); return getSettings();

    default:
      throw new Error('Unknown GET action: ' + action);
  }
}

/* ------------------------------- doPost ------------------------------ */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var data = routePost(body.action, body);
    return jsonOk(data);
  } catch (err) {
    return jsonErr(err.message || String(err));
  }
}

/** POST actions are writes (or login). Roles enforced per action. */
function routePost(action, b) {
  // Login is the only write that doesn't need an existing session.
  if (action === 'login') return login(b.email, b.pin);
  if (action === 'logout') return logout(b.token);

  // Everything else needs a session. Writers must be admin or teacher.
  var WRITERS = ['admin', 'teacher'];

  switch (action) {
    // Campaigns
    case 'saveCampaign':    requireRole(b.token, WRITERS); return saveCampaign(b);

    // Tasks
    case 'saveTask':        requireRole(b.token, WRITERS); return saveTask(b);
    case 'setTaskStatus':   requireRole(b.token, WRITERS); return setTaskStatus(b.taskId, b.status);
    case 'duplicateTask':   requireRole(b.token, WRITERS); return duplicateTask(b.taskId);

    // Students
    case 'importStudents':  requireRole(b.token, WRITERS); return importStudents(b.rows);

    // QR splitter + control panel
    case 'generateQRBatch': requireRole(b.token, WRITERS); return generateQRBatch(b);
    case 'updateQR':        requireRole(b.token, WRITERS); return updateQR(b);
    case 'regenerateQR':    requireRole(b.token, WRITERS); return regenerateQR(b.token2 || b.qrToken);
    case 'setQRStatus':     requireRole(b.token, WRITERS); return setQRStatus(b.qrToken, b.status);

    // Completion
    case 'markComplete':    requireRole(b.token, WRITERS); return markComplete(b);

    // Settings + users (admin only)
    case 'saveSetting':     requireRole(b.token, ['admin']); return saveSetting(b.key, b.value);
    case 'createUser':      return createUser(requireRole(b.token, ['admin']), b);

    default:
      throw new Error('Unknown POST action: ' + action);
  }
}

/* --------------------------- Scan redirect --------------------------- */
/**
 * Returns a tiny HTML page that forwards the pupil to the master link.
 * GAS web apps can't issue a raw 302, so we use location.replace() plus a
 * <meta refresh> fallback and a manual "tap here" link. Works from any phone
 * camera/browser.
 */
function redirectPage(url) {
  var safe = cleanUrl(url) || CONFIG.FALLBACK_REDIRECT;
  var esc = safe.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  var html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="refresh" content="0; url=' + esc + '">' +
    '<title>Opening your task…</title>' +
    '<style>body{font-family:system-ui,Arial,sans-serif;display:flex;min-height:100vh;' +
    'margin:0;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;text-align:center}' +
    '.b{padding:24px}.s{width:42px;height:42px;border:4px solid #334155;border-top-color:#38bdf8;' +
    'border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}' +
    '@keyframes spin{to{transform:rotate(360deg)}}a{color:#38bdf8}</style></head>' +
    '<body><div class="b"><div class="s"></div><p>Opening your task…</p>' +
    '<p><a href="' + esc + '" target="_top">Tap here if it does not open</a></p></div>' +
    // Try a TOP-level redirect first (changes the address bar); GAS runs this
    // inside a sandboxed iframe, so fall back to navigating the iframe itself.
    '<script>var u="' + esc.replace(/"/g, '\\"') + '";' +
    'try{window.top.location.replace(u);}catch(e){window.location.replace(u);}</script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
