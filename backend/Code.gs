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
    // Hosted quiz: handleScan returns our OWN ?app= URL. Serve the quiz INLINE here
    // (one page load) instead of redirecting GAS→GAS, which phones block / error on.
    if (dest && dest.indexOf('?app=') !== -1 && dest.indexOf('qid=') !== -1) {
      var mA = dest.match(/[?&]app=([^&]+)/), mQ = dest.match(/[?&]qid=([^&]+)/);
      return appPage(decodeURIComponent(mA ? mA[1] : ''), decodeURIComponent(mQ ? mQ[1] : ''));
    }
    return redirectPage(dest);
  }

  // A2) CERTIFICATE VERIFY: a certificate QR was opened. p.cert is the token.
  if (p.cert) {
    return verifyPage(verifyCertificate(p.cert));
  }

  // A3) RESULT CALLBACK: a task reports a pupil's score. ?done=<token>&score=&max=
  if (p.done) {
    return resultPage(submitResult(p.done, p.score, p.max));
  }

  // A5) QUIZ PLAYER API (public JSON, keyed by the unguessable QR token):
  //   ?play=<token>            → logs the scan, returns quiz questions or a redirect
  //   ?finish=<token>&a=A,B,…  → grades the answers, records score + points
  if (p.play)   { return jsonOk(playInfo(p.play, p.ua || '')); }
  if (p.finish) { return jsonOk(finishQuiz(p.finish, p.a)); }

  // A4) HOSTED QUIZ: serve a teacher-pasted quiz with the score hook wired in.
  if (p.app) {
    return appPage(p.app, p.qid || '');
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
    case 'bloomReport':    requireRole(p.token, CONFIG.ROLES); return bloomReport();
    case 'listCampaigns':  requireRole(p.token, CONFIG.ROLES); return listCampaigns();
    case 'listTasks':      requireRole(p.token, CONFIG.ROLES); return listTasks();
    case 'getTask':        requireRole(p.token, CONFIG.ROLES); return getTask(p.taskId);
    case 'listStudents':   requireRole(p.token, CONFIG.ROLES); return listStudents();
    case 'listGroups':     requireRole(p.token, CONFIG.ROLES); return listGroups();
    case 'listQRCodes':    requireRole(p.token, CONFIG.ROLES); return listQRCodes(p.taskId);
    case 'getQR':          requireRole(p.token, CONFIG.ROLES); return getQR(p.qrToken);
    case 'getQRDetail':    requireRole(p.token, CONFIG.ROLES); return getQRDetail(p.qrToken);
    case 'getSettings':    requireRole(p.token, CONFIG.ROLES); return getSettings();

    // ---- Phase 2 reads ----
    case 'getCampaign':      requireRole(p.token, CONFIG.ROLES); return getCampaign(p.campaignId);
    case 'leaderboard':      requireRole(p.token, CONFIG.ROLES); return getLeaderboard(p.className);
    case 'listBadges':       requireRole(p.token, CONFIG.ROLES); return listBadges();
    case 'getStudentBadges': requireRole(p.token, CONFIG.ROLES); return getStudentBadges(p.entityId);
    case 'getStudentPoints': requireRole(p.token, CONFIG.ROLES); return { entityId: p.entityId, points: getStudentPoints(p.entityId) };
    case 'listRewards':      requireRole(p.token, CONFIG.ROLES); return listRewards();
    case 'listCertificates': requireRole(p.token, CONFIG.ROLES); return listCertificates(p.scopeId);
    case 'getCertificate':   requireRole(p.token, CONFIG.ROLES); return getCertificate(p.certToken);
    case 'getTaskApp':       requireRole(p.token, CONFIG.ROLES); return getTaskApp(p.taskId);
    case 'getQuiz':          requireRole(p.token, CONFIG.ROLES); return getQuiz(p.taskId);
    case 'hasGeminiKey':     requireRole(p.token, CONFIG.ROLES); return hasGeminiKey();

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

  // PUBLIC: the quiz player submits answers (keyed by the QR token itself —
  // pupils have no login). Structured answers don't fit in a GET URL.
  if (action === 'finishQuiz') return finishQuiz(b.playToken, b.answers);

  // Everything else needs a session. Writers must be admin or teacher.
  var WRITERS = ['admin', 'teacher'];

  switch (action) {
    // Campaigns
    case 'saveCampaign':    requireRole(b.token, WRITERS); return saveCampaign(b);

    // Tasks
    case 'saveTask':        requireRole(b.token, WRITERS); return saveTask(b);
    case 'setTaskStatus':   requireRole(b.token, WRITERS); return setTaskStatus(b.taskId, b.status);
    case 'duplicateTask':   requireRole(b.token, WRITERS); return duplicateTask(b.taskId);
    case 'saveTaskApp':     requireRole(b.token, WRITERS); return saveTaskApp(b.taskId, b.html);
    case 'deleteTaskApp':   requireRole(b.token, WRITERS); return deleteTaskApp(b.taskId);
    case 'saveQuiz':        requireRole(b.token, WRITERS); return saveQuiz(b.taskId, b.questions);
    case 'extractQuiz':     requireRole(b.token, WRITERS); return extractQuiz(b.file, b.mime, b.files);
    case 'quizFromNotes':   requireRole(b.token, WRITERS); return quizFromNotes(b.file, b.mime, b.files, b.count);
    case 'generateBloomQuiz': requireRole(b.token, WRITERS); return generateBloomQuiz(b);
    case 'saveGeminiKey':   requireRole(b.token, ['admin']); return saveGeminiKey(b.key);

    // Students
    case 'importStudents':  requireRole(b.token, WRITERS); return importStudents(b.rows);

    // Groups (ability-grouping / differentiation)
    case 'saveGroup':       requireRole(b.token, WRITERS); return saveGroup(b);
    case 'assignGroup':     requireRole(b.token, WRITERS); return assignGroup(b.studentIds, b.groupId);
    case 'deleteGroup':     requireRole(b.token, WRITERS); return deleteGroup(b.groupId);

    // QR splitter + control panel
    case 'generateQRBatch': requireRole(b.token, WRITERS); return generateQRBatch(b);
    case 'updateQR':        requireRole(b.token, WRITERS); return updateQR(b);
    case 'regenerateQR':    requireRole(b.token, WRITERS); return regenerateQR(b.token2 || b.qrToken);
    case 'setQRStatus':     requireRole(b.token, WRITERS); return setQRStatus(b.qrToken, b.status);

    // Completion
    case 'markComplete':    requireRole(b.token, WRITERS); return markComplete(b);

    // ---- Phase 2 writes ----
    case 'saveBadge':         requireRole(b.token, WRITERS); return saveBadge(b);
    case 'awardPoints':       requireRole(b.token, WRITERS); return awardPoints(b.entityId, b.taskId, Number(b.points), b.reason || 'Manual award');
    case 'saveReward':        requireRole(b.token, WRITERS); return saveReward(b);
    case 'redeemReward':      requireRole(b.token, WRITERS); return redeemReward(b);
    case 'issueCertificate':  requireRole(b.token, WRITERS); return issueCertificate(b);
    case 'revokeCertificate': requireRole(b.token, WRITERS); return revokeCertificate(b.certToken);

    // Deletions (destructive; admin/teacher only, confirmed in the UI)
    case 'deleteTask':        requireRole(b.token, WRITERS); return deleteTask(b.taskId);
    case 'deleteStudent':     requireRole(b.token, WRITERS); return deleteStudent(b.studentId);
    case 'deleteStudents':    requireRole(b.token, WRITERS); return deleteStudents(b.studentIds);
    case 'deleteQR':          requireRole(b.token, WRITERS); return deleteQR(b.qrToken);
    case 'deleteCampaign':    requireRole(b.token, WRITERS); return deleteCampaign(b.campaignId);
    case 'deleteBadge':       requireRole(b.token, WRITERS); return deleteBadge(b.badgeId);
    case 'deleteReward':      requireRole(b.token, WRITERS); return deleteReward(b.rewardId);

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

/* ----------------------- Certificate verify page ----------------------- */
/**
 * The page shown when someone scans a certificate's QR (?cert=<token>).
 * Green tick + the pupil's name if genuine, red cross if revoked/unknown.
 */
function verifyPage(r) {
  var ok = !!(r && r.valid);
  var color = ok ? '#16a34a' : '#dc2626';
  var mark = ok ? '&#10003;' : '&#10007;'; // ✓ / ✕
  var inner = ok
    ? '<h1 style="color:' + color + '">' + mark + ' Verified</h1>' +
      '<p class="big">' + escapeHtml(r.entityName) + '</p>' +
      '<p>' + escapeHtml(r.title) + '</p>' +
      '<p class="muted">Issued ' + escapeHtml(String(r.issuedAt).slice(0, 10)) +
      (r.issuedBy ? ' by ' + escapeHtml(r.issuedBy) : '') + '</p>' +
      '<p class="muted">Ref: ' + escapeHtml(r.certId) + '</p>'
    : '<h1 style="color:' + color + '">' + mark + ' Not valid</h1>' +
      '<p>' + escapeHtml((r && r.message) || 'Unknown certificate.') + '</p>';

  var html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Certificate check</title>' +
    '<style>body{font-family:system-ui,Arial,sans-serif;min-height:100vh;margin:0;display:flex;' +
    'align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;text-align:center;padding:16px}' +
    '.card{background:#1e293b;padding:32px 28px;border-radius:18px;max-width:380px;box-shadow:0 20px 50px rgba(0,0,0,.45)}' +
    'h1{margin:.2em 0;font-size:1.6rem}.big{font-size:1.3rem;font-weight:700;margin:.4em 0}' +
    '.muted{color:#94a3b8;font-size:.9rem;margin:.2em 0}</style></head>' +
    '<body><div class="card">' + inner + '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ----------------------- Hosted quiz + result pages ----------------------- */
/**
 * Serve a teacher-pasted quiz (?app=<taskId>&qid=<token>). We inject a small
 * shim that defines window.qramsDone(score, total) — the quiz calls it when the
 * pupil finishes, and it beacons the score back to /exec?done=...
 */
function appPage(taskId, token) {
  var app = getTaskApp(taskId);
  var quiz = (app && app.html)
    ? String(app.html)
    : '<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:24px">This task has no quiz yet.</p>';

  var shim =
    '<script>(function(){' +
    'window.QRAMS_TOKEN=' + JSON.stringify(String(token)) + ';' +
    'window.QRAMS_EXEC=' + JSON.stringify(String(webAppUrl())) + ';' +
    'window.qramsDone=function(score,total){' +
      'var s=Number(score)||0,t=Number(total)||0;' +
      'try{new Image().src=QRAMS_EXEC+"?done="+encodeURIComponent(QRAMS_TOKEN)+"&score="+s+"&max="+t;}catch(e){}' +
      'try{var d=document.createElement("div");' +
      'd.setAttribute("style","position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f172a;color:#34d399;font-family:system-ui;text-align:center;padding:24px");' +
      'd.innerHTML="<div style=\\"font-size:3rem\\">\\u2713</div><div style=\\"font-size:1.3rem;font-weight:700;margin-top:8px\\">Saved! Score "+s+" / "+t+"</div><div style=\\"color:#94a3b8;margin-top:6px\\">You can close this page now.</div>";' +
      'document.body.appendChild(d);}catch(e){}' +
    '};})();</script>';

  // Inject the shim into the quiz's own <head>/<body> so qramsDone exists early.
  var out;
  if (/<head[^>]*>/i.test(quiz)) out = quiz.replace(/<head[^>]*>/i, function (m) { return m + shim; });
  else if (/<body[^>]*>/i.test(quiz)) out = quiz.replace(/<body[^>]*>/i, function (m) { return m + shim; });
  else out = shim + quiz;

  return HtmlService.createHtmlOutput(out)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Friendly page shown if someone opens the result-callback URL directly. */
function resultPage(r) {
  var ok = !!(r && r.ok);
  var msg = ok ? ('✓ Saved! Score ' + r.score + ' / ' + r.max) : ((r && r.message) || 'Could not save.');
  var html = '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Result</title>' +
    '<style>body{font-family:system-ui,Arial,sans-serif;min-height:100vh;margin:0;display:flex;' +
    'align-items:center;justify-content:center;background:#0f172a;color:' + (ok ? '#34d399' : '#f87171') +
    ';font-size:1.3rem;text-align:center;padding:24px}</style></head><body><div>' + escapeHtml(msg) + '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
