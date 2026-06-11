/**
 * Api.gs
 * =============================================================================
 * All business logic lives here. Code.gs just routes requests to these
 * functions. Each function returns plain data (objects/arrays); the router
 * wraps it in jsonOk().
 *
 * Sections:
 *   1. Campaigns
 *   2. Tasks
 *   3. Students & Groups
 *   4. QR Splitter + QR control panel
 *   5. Scan flow (the core redirect + tracking)
 *   6. Completion
 *   7. Dashboard (cached aggregates)
 * =============================================================================
 */

/* ============================ 1. CAMPAIGNS ============================ */

function listCampaigns() { return readAll(SHEETS.CAMPAIGNS); }

function saveCampaign(payload) {
  var ids = readAll(SHEETS.CAMPAIGNS).map(function (c) { return c.campaignId; });
  if (payload.campaignId) {
    return updateWhere(SHEETS.CAMPAIGNS, 'campaignId', payload.campaignId, {
      name: clean(payload.name), description: clean(payload.description),
      subject: clean(payload.subject), program: clean(payload.program),
      startDate: clean(payload.startDate), endDate: clean(payload.endDate),
      status: clean(payload.status), teacherInCharge: clean(payload.teacherInCharge),
      notes: clean(payload.notes),
    });
  }
  var camp = {
    campaignId: nextId('CAMP', ids), name: clean(payload.name),
    description: clean(payload.description), subject: clean(payload.subject),
    program: clean(payload.program), startDate: clean(payload.startDate),
    endDate: clean(payload.endDate), status: clean(payload.status) || 'Draft',
    teacherInCharge: clean(payload.teacherInCharge), notes: clean(payload.notes),
    createdAt: nowIso(),
  };
  appendRow(SHEETS.CAMPAIGNS, camp);
  return camp;
}

/** One campaign plus a rollup (its tasks, how many QR codes, % completed). */
function getCampaign(campaignId) {
  var c = findOne(SHEETS.CAMPAIGNS, 'campaignId', campaignId);
  if (!c) throw new Error('Campaign not found.');
  var tasks = listTasks().filter(function (t) { return String(t.campaignId) === String(campaignId); });
  var inCampaign = {};
  tasks.forEach(function (t) { inCampaign[t.taskId] = true; });
  var qrs = readAll(SHEETS.QR_CODES).filter(function (q) { return inCampaign[q.taskId]; });
  var done = qrs.filter(function (q) { return q.progress === 'Completed'; }).length;
  c.tasks = tasks;
  c.stats = {
    tasks: tasks.length, qrCodes: qrs.length, completed: done,
    completionRate: qrs.length ? Math.round((done / qrs.length) * 100) : 0,
  };
  return c;
}

/* ============================== 2. TASKS ============================== */

function listTasks() { return readAll(SHEETS.TASKS); }

function getTask(taskId) { return findOne(SHEETS.TASKS, 'taskId', taskId); }

/** Create (no taskId) or update (taskId given) a task. */
function saveTask(payload) {
  var appType = ENUMS.appType.indexOf(clean(payload.appType)) !== -1 ? clean(payload.appType) : 'link';
  var common = {
    campaignId: clean(payload.campaignId),
    title: clean(payload.title), description: clean(payload.description),
    subject: clean(payload.subject), teacherName: clean(payload.teacherName),
    dueDate: clean(payload.dueDate), category: clean(payload.category),
    masterLink: cleanUrl(payload.masterLink),
    appType: appType,
    completionMode: clean(payload.completionMode) || 'auto',
    pointsValue: Number(payload.pointsValue) || 0,
    status: clean(payload.status) || 'Active',
    updatedAt: nowIso(),
  };
  if (!common.title) throw new Error('Task title is required.');
  // A master link is required only for 'link' tasks; 'hosted' tasks use their own quiz.
  if (appType === 'link' && !common.masterLink) throw new Error('A valid http(s) master link is required.');

  if (payload.taskId) {
    invalidateDashboard();
    return updateWhere(SHEETS.TASKS, 'taskId', payload.taskId, common);
  }
  var ids = readAll(SHEETS.TASKS).map(function (t) { return t.taskId; });
  common.taskId = nextId('TASK', ids);
  common.createdAt = nowIso();
  appendRow(SHEETS.TASKS, common);
  invalidateDashboard();
  return common;
}

function setTaskStatus(taskId, status) {
  if (ENUMS.taskStatus.indexOf(status) === -1) throw new Error('Bad status.');
  invalidateDashboard();
  return updateWhere(SHEETS.TASKS, 'taskId', taskId, { status: status, updatedAt: nowIso() });
}

/** Duplicate a task (without its QR codes). */
function duplicateTask(taskId) {
  var t = getTask(taskId);
  if (!t) throw new Error('Task not found.');
  var copy = JSON.parse(JSON.stringify(t));
  delete copy.taskId;
  copy.title = t.title + ' (Copy)';
  copy.status = 'Active';
  return saveTask(copy);
}

/* ======================= 3. STUDENTS & GROUPS ======================= */

function listStudents() { return readAll(SHEETS.STUDENTS); }
function listGroups() { return readAll(SHEETS.GROUPS); }

/** Create or rename a group (used for ability-grouping / differentiation). */
function saveGroup(payload) {
  var common = { name: clean(payload.name), className: clean(payload.className), notes: clean(payload.notes) };
  if (!common.name) throw new Error('Group name is required.');
  if (payload.groupId) return updateWhere(SHEETS.GROUPS, 'groupId', payload.groupId, common);
  var ids = readAll(SHEETS.GROUPS).map(function (g) { return g.groupId; });
  common.groupId = nextId('GRP', ids);
  common.memberIds = '';
  common.createdAt = nowIso();
  appendRow(SHEETS.GROUPS, common);
  return common;
}

/** Put one or many students into a group (groupId '' = remove from group). */
function assignGroup(studentIds, groupId) {
  if (!studentIds || !studentIds.length) throw new Error('No students selected.');
  var gid = clean(groupId);
  var n = 0;
  studentIds.forEach(function (sid) {
    if (updateWhere(SHEETS.STUDENTS, 'studentId', clean(sid), { groupId: gid })) n++;
  });
  invalidateDashboard();
  return { assigned: n, groupId: gid };
}

/** Delete a group; its members simply become ungrouped. */
function deleteGroup(groupId) {
  if (!findOne(SHEETS.GROUPS, 'groupId', groupId)) throw new Error('Group not found.');
  readAll(SHEETS.STUDENTS).forEach(function (s) {
    if (String(s.groupId) === String(groupId)) updateWhere(SHEETS.STUDENTS, 'studentId', s.studentId, { groupId: '' });
  });
  deleteWhere(SHEETS.GROUPS, 'groupId', groupId);
  return { deleted: groupId };
}

/**
 * Bulk import students. Accepts an array of {name, studentId?, className, group?,
 * gender?, notes?}. Auto-generates studentId when missing. De-dupes by id.
 */
function importStudents(rows) {
  if (!rows || !rows.length) throw new Error('No rows to import.');
  var existing = readAll(SHEETS.STUDENTS);
  var existingIds = existing.map(function (s) { return s.studentId; });
  var toAdd = [];

  rows.forEach(function (r) {
    var name = clean(r.name);
    if (!name) return;
    var id = clean(r.studentId) || nextId('STU', existingIds.concat(toAdd.map(function (x) { return x.studentId; })));
    if (existingIds.indexOf(id) !== -1) return; // skip duplicates
    toAdd.push({
      studentId: id, name: name, className: clean(r.className),
      groupId: clean(r.group || r.groupId), gender: clean(r.gender),
      notes: clean(r.notes), createdAt: nowIso(),
    });
  });

  appendRows(SHEETS.STUDENTS, toAdd);
  return { added: toAdd.length, skipped: rows.length - toAdd.length, students: toAdd };
}

/* ================== 4. QR SPLITTER + CONTROL PANEL ================== */

/**
 * THE SPLITTER. Generate many unique QR codes for one task.
 *
 * payload = {
 *   taskId,
 *   entityType: 'student' | 'group' | 'class' | 'custom',
 *   entityIds: ['STU001', ...]   // for student/group
 *   className: '3 Cerdik'        // for class batch (uses all students in class)
 *   labels: ['Front desk', ...]  // for custom (free-text owners)
 * }
 *
 * Skips entities that already have a QR for this task (no duplicates, ever).
 */
function generateQRBatch(payload) {
  var task = getTask(payload.taskId);
  if (!task) throw new Error('Task not found.');

  var existing = findWhere(SHEETS.QR_CODES, 'taskId', payload.taskId);
  var already = {};
  existing.forEach(function (q) { already[q.entityType + ':' + q.entityId] = true; });

  var targets = resolveTargets(payload); // [{entityType, entityId, label, className}]
  var newQrs = [];

  targets.forEach(function (t) {
    var key = t.entityType + ':' + t.entityId;
    if (already[key]) return; // collision prevention
    newQrs.push({
      token: makeToken(payload.taskId, t.entityId),
      taskId: payload.taskId, entityType: t.entityType, entityId: t.entityId,
      label: t.label, className: t.className || '',
      status: 'Active', progress: 'Not Started',
      firstScan: '', lastScan: '', scanCount: 0,
      completedAt: '', points: 0, remarks: '', createdAt: nowIso(),
    });
  });

  appendRows(SHEETS.QR_CODES, newQrs);
  invalidateDashboard();
  return { created: newQrs.length, skipped: targets.length - newQrs.length, qrCodes: newQrs };
}

/** Turn a batch request into a concrete list of entities to encode. */
function resolveTargets(payload) {
  var type = payload.entityType || 'student';
  var students = listStudents();

  if (type === 'class') {
    return students
      .filter(function (s) { return String(s.className) === String(payload.className); })
      .map(function (s) {
        return { entityType: 'student', entityId: s.studentId, label: s.name, className: s.className };
      });
  }
  if (type === 'student') {
    var byId = {};
    students.forEach(function (s) { byId[s.studentId] = s; });
    return (payload.entityIds || []).map(function (id) {
      var s = byId[id] || {};
      return { entityType: 'student', entityId: id, label: s.name || id, className: s.className || '' };
    });
  }
  if (type === 'group') {
    // Generate one QR PER STUDENT in the group (individual tracking, by ability group).
    return students
      .filter(function (s) { return payload.groupId && String(s.groupId) === String(payload.groupId); })
      .map(function (s) {
        return { entityType: 'student', entityId: s.studentId, label: s.name, className: s.className || '' };
      });
  }
  // custom: free-text labels become their own entities
  return (payload.labels || []).map(function (label, i) {
    return { entityType: 'custom', entityId: 'C' + pad(i + 1, 3), label: clean(label), className: '' };
  });
}

/** All QR codes, optionally filtered by taskId. */
function listQRCodes(taskId) {
  return taskId ? findWhere(SHEETS.QR_CODES, 'taskId', taskId) : readAll(SHEETS.QR_CODES);
}

function getQR(token) { return findOne(SHEETS.QR_CODES, 'token', token); }

/** Full tracking detail for ONE QR: the record + its scan & completion history. */
function getQRDetail(token) {
  var qr = getQR(token);
  if (!qr) throw new Error('QR not found.');
  var scans = findWhere(SHEETS.SCAN_LOGS, 'token', token)
    .sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  var completions = findWhere(SHEETS.COMPLETION_LOGS, 'token', token);
  var task = getTask(qr.taskId);
  return { qr: qr, task: task, scans: scans, completions: completions };
}

/** Admin edit of a QR (label, status, progress, remarks, reassignment). */
function updateQR(payload) {
  var patch = {};
  ['label', 'status', 'progress', 'remarks', 'entityId', 'className'].forEach(function (k) {
    if (payload[k] !== undefined) patch[k] = clean(payload[k]);
  });
  invalidateDashboard();
  return updateWhere(SHEETS.QR_CODES, 'token', payload.token, patch);
}

/** Regenerate a token (e.g. if a QR leaked) while keeping the owner + history link. */
function regenerateQR(token) {
  var qr = getQR(token);
  if (!qr) throw new Error('QR not found.');
  var fresh = makeToken(qr.taskId, qr.entityId);
  updateWhere(SHEETS.QR_CODES, 'token', token, { token: fresh });
  return getQR(fresh);
}

function setQRStatus(token, status) {
  if (ENUMS.qrStatus.indexOf(status) === -1) throw new Error('Bad QR status.');
  invalidateDashboard();
  return updateWhere(SHEETS.QR_CODES, 'token', token, { status: status });
}

/* ===================== 5. SCAN FLOW (the core) ===================== */

/**
 * Handle a scan. Called by doGet when ?id=<token> is present.
 * Returns the destination master link (string) and records everything.
 * Designed to be FAST and never throw to the pupil — worst case we redirect
 * to the fallback so a child is never shown an error.
 */
function handleScan(token, userAgent) {
  token = clean(token);
  try {
    var qr = getQR(token);
    if (!qr) return CONFIG.FALLBACK_REDIRECT;

    var task = getTask(qr.taskId) || {};
    var link = buildTaskUrl(task, token); // hosted quiz, or master link with ?qid=token

    // Disabled/expired QR: still redirect (don't punish the child) but don't count.
    if (qr.status === 'Disabled' || qr.status === 'Expired') return link;

    var now = nowIso();
    var count = (Number(qr.scanCount) || 0) + 1;
    var firstScan = qr.firstScan || now;

    // Progress moves forward on scan but never backwards past "Completed".
    var progress = qr.progress;
    if (progress === 'Not Started' || progress === '') progress = 'Opened';
    else if (progress === 'Opened') progress = 'Started';

    // Auto-complete tasks: a scan marks done.
    var patch = { lastScan: now, scanCount: count, firstScan: firstScan, progress: progress };
    if (task.completionMode === 'auto' && qr.progress !== 'Completed') {
      patch.progress = 'Completed';
      patch.completedAt = now;
      patch.points = Number(task.pointsValue) || 0;
    }
    updateWhere(SHEETS.QR_CODES, 'token', token, patch);

    // Append the scan log (its own row — full history).
    appendRow(SHEETS.SCAN_LOGS, {
      logId: uid('SCAN'), token: token, taskId: qr.taskId, entityId: qr.entityId,
      timestamp: now, deviceType: deviceFromUA(userAgent),
      userAgent: clean(userAgent).slice(0, 300), action: 'scan',
    });

    // Gamification side-effects — only when the school has switched it on.
    // Kept after the redirect-critical work so a slow ledger write never
    // delays the pupil (and it's skipped entirely when the flag is off).
    if (isGamificationOn()) {
      if (patch.progress === 'Completed' && qr.progress !== 'Completed') {
        awardPoints(qr.entityId, qr.taskId, Number(task.pointsValue) || 0, 'task:' + qr.taskId);
      }
      checkBadges(qr.entityId); // also catches the 'first_scan' badge
    }

    invalidateDashboard();
    return link;
  } catch (err) {
    // Never show a child an error — log it and redirect somewhere safe.
    Logger.log('Scan error for ' + token + ': ' + err);
    return CONFIG.FALLBACK_REDIRECT;
  }
}

/* ======================== 6. COMPLETION ======================== */

/** Teacher marks a QR complete (manual mode) or records a review. */
function markComplete(payload) {
  var qr = getQR(payload.token);
  if (!qr) throw new Error('QR not found.');
  var task = getTask(qr.taskId) || {};
  var now = nowIso();
  var wasCompleted = String(qr.progress) === 'Completed';

  updateWhere(SHEETS.QR_CODES, 'token', payload.token, {
    progress: 'Completed', completedAt: now,
    points: Number(task.pointsValue) || 0,
    remarks: payload.remarks !== undefined ? clean(payload.remarks) : qr.remarks,
  });

  appendRow(SHEETS.COMPLETION_LOGS, {
    logId: uid('COMP'), token: payload.token, taskId: qr.taskId, entityId: qr.entityId,
    method: clean(payload.method) || 'manual', status: 'Completed',
    durationSec: Number(payload.durationSec) || '', evidence: cleanUrl(payload.evidence),
    reviewedBy: clean(payload.reviewedBy), notes: clean(payload.notes), timestamp: now,
  });

  // Award points + check badges once (only if newly completed and gamification is on).
  if (isGamificationOn()) {
    if (!wasCompleted) {
      awardPoints(qr.entityId, qr.taskId, Number(task.pointsValue) || 0, 'task:' + qr.taskId + ' (manual)');
    }
    checkBadges(qr.entityId);
  }

  invalidateDashboard();
  return getQR(payload.token);
}

/* ================= TASK OUTPUT INTEGRATION ================= */
/* Closes the loop: the actual quiz/task reports the pupil's SCORE back, so
   points reflect real performance — not just scanning. QRAMS can also HOST a
   teacher-pasted quiz and serve it itself (see appPage() in Code.gs). */

/** The published Web App URL (…/exec). Empty string if not deployed yet. */
function webAppUrl() {
  // Prefer the exact /exec URL the frontend stored (matches the QR codes), so the
  // score callback always points at the right place; fall back to the runtime URL.
  try { var s = getSettings(); if (s && s.execUrl) return String(s.execUrl); } catch (e) {}
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

/** Where a scan should send the pupil, passing their token so results can come back. */
function buildTaskUrl(task, token) {
  if (task && String(task.appType) === 'quiz') {
    // Built-in quiz → the QRAMS player page (clean URL, no Google sandbox).
    return CONFIG.PLAYER_URL + '?t=' + encodeURIComponent(token);
  }
  if (task && String(task.appType) === 'hosted') {
    return webAppUrl() + '?app=' + encodeURIComponent(task.taskId) + '&qid=' + encodeURIComponent(token);
  }
  var link = cleanUrl(task && task.masterLink) || CONFIG.FALLBACK_REDIRECT;
  var sep = link.indexOf('?') === -1 ? '?' : '&';
  return link + sep + 'qid=' + encodeURIComponent(token); // task can read ?qid to report back
}

/**
 * A task reports a result:  /exec?done=<token>&score=<n>&max=<m>
 * Records completion + score and awards points proportional to the score.
 * Never throws to the pupil.
 */
function submitResult(token, score, max) {
  token = clean(token);
  try {
    var qr = getQR(token);
    if (!qr) return { ok: false, message: 'Unknown code.' };
    var task = getTask(qr.taskId) || {};
    var now = nowIso();
    var sc = Math.max(0, Number(score) || 0);
    var mx = Math.max(0, Number(max) || 0);
    var pct = mx > 0 ? sc / mx : 1;
    var pts = Math.round((Number(task.pointsValue) || 0) * pct);
    var wasCompleted = String(qr.progress) === 'Completed';

    updateWhere(SHEETS.QR_CODES, 'token', token, {
      progress: 'Completed', completedAt: now, lastScan: now,
      score: sc, maxScore: mx, points: pts,
    });
    appendRow(SHEETS.COMPLETION_LOGS, {
      logId: uid('COMP'), token: token, taskId: qr.taskId, entityId: qr.entityId,
      method: 'callback', status: 'Completed', score: sc, maxScore: mx,
      durationSec: '', evidence: '', reviewedBy: '', notes: '', timestamp: now,
    });
    if (isGamificationOn() && !wasCompleted) {
      awardPoints(qr.entityId, qr.taskId, pts, 'task:' + qr.taskId + ' (score ' + sc + '/' + mx + ')');
      checkBadges(qr.entityId);
    }
    invalidateDashboard();
    return { ok: true, name: qr.label, score: sc, max: mx, points: pts };
  } catch (err) {
    Logger.log('submitResult error ' + token + ': ' + err);
    return { ok: false, message: 'Could not save your result.' };
  }
}

/* ================= BUILT-IN QUIZZES (QRAMS makes & marks them) ================= */
/* Questions live as ROWS in the Quiz_Questions sheet, so teachers can edit them
   in the UI or straight in Google Sheets. The pupil-facing player (quiz.html on
   the frontend) calls the two PUBLIC endpoints below; the correct answers never
   leave the server until the pupil has submitted (no peeking in dev tools). */

/** Teacher read (auth'd): full questions including the correct letters. */
function getQuiz(taskId) {
  var rows = findWhere(SHEETS.QUIZ_QUESTIONS, 'taskId', clean(taskId))
    .sort(function (a, b) { return Number(a.qNo) - Number(b.qNo); });
  return rows.map(function (r) {
    return {
      qNo: Number(r.qNo), question: String(r.question || ''),
      options: [r.optionA, r.optionB, r.optionC, r.optionD].map(function (o) { return String(o == null ? '' : o); }),
      correct: String(r.correct || 'A').toUpperCase(),
    };
  });
}

/** Replace a task's whole question set (from the builder UI). */
function saveQuiz(taskId, questions) {
  taskId = clean(taskId);
  if (!taskId) throw new Error('taskId is required.');
  if (!questions || !questions.length) throw new Error('Add at least one question.');
  if (questions.length > 50) throw new Error('Maximum 50 questions per quiz.');

  var letters = ['A', 'B', 'C', 'D'];
  var rows = questions.map(function (q, i) {
    // Accept both shapes: {q: …} (builder/AI import) and {question: …}.
    var text = clean(q.q !== undefined && q.q !== null && String(q.q) !== '' ? q.q : q.question);
    var opts = (q.options || []).map(function (o) { return clean(o); });
    var correct = String(q.correct || 'A').toUpperCase();
    if (!text) throw new Error('Question ' + (i + 1) + ' has no text.');
    if (!opts[0] || !opts[1]) throw new Error('Question ' + (i + 1) + ' needs at least options A and B.');
    if (letters.indexOf(correct) === -1) throw new Error('Question ' + (i + 1) + ': correct must be A–D.');
    if (!opts[letters.indexOf(correct)]) throw new Error('Question ' + (i + 1) + ': the correct option is empty.');
    return {
      taskId: taskId, qNo: i + 1, question: text,
      optionA: opts[0] || '', optionB: opts[1] || '', optionC: opts[2] || '', optionD: opts[3] || '',
      correct: correct,
    };
  });

  deleteAllWhere(SHEETS.QUIZ_QUESTIONS, 'taskId', taskId);
  appendRows(SHEETS.QUIZ_QUESTIONS, rows);
  updateWhere(SHEETS.TASKS, 'taskId', taskId, { appType: 'quiz', updatedAt: nowIso() });
  invalidateDashboard();
  return { taskId: taskId, questions: rows.length };
}

/**
 * PUBLIC: the player page loads → logs the scan and returns what to show.
 * For quiz tasks the questions are sent WITHOUT the correct answers.
 * For link/hosted tasks the player just redirects to the returned URL.
 */
function playInfo(token, userAgent) {
  token = clean(token);
  var dest = handleScan(token, userAgent); // logs the scan + all side effects
  var qr = getQR(token);
  if (!qr) return { kind: 'unknown', message: 'This code is not recognised.' };
  var task = getTask(qr.taskId) || {};

  if (String(task.appType) === 'quiz') {
    var qs = getQuiz(qr.taskId).map(function (q) {
      return { qNo: q.qNo, question: q.question, options: q.options.filter(function (o) { return o !== ''; }) };
    });
    if (!qs.length) return { kind: 'unknown', message: 'This quiz has no questions yet.' };
    return {
      kind: 'quiz', name: qr.label, taskTitle: task.title, subject: task.subject || '',
      points: Number(task.pointsValue) || 0,
      already: String(qr.progress) === 'Completed',
      questions: qs,
    };
  }
  // External link or hosted HTML: the player simply forwards the pupil.
  return { kind: 'redirect', url: dest };
}

/**
 * PUBLIC: grade a finished quiz. `answersCsv` is e.g. "A,C,B,D,A".
 * Records score + points on the FIRST completion only; later attempts are
 * marked review-only (so nobody can grind points by repeating).
 */
function finishQuiz(token, answersCsv) {
  token = clean(token);
  var qr = getQR(token);
  if (!qr) return { kind: 'unknown', message: 'This code is not recognised.' };
  var task = getTask(qr.taskId) || {};
  var full = getQuiz(qr.taskId);
  if (!full.length) return { kind: 'unknown', message: 'This quiz has no questions.' };

  var answers = String(answersCsv || '').toUpperCase().split(',');
  var review = [], score = 0;
  full.forEach(function (q, i) {
    var your = clean(answers[i] || '');
    var ok = your === q.correct;
    if (ok) score++;
    review.push({ qNo: q.qNo, your: your, correct: q.correct, ok: ok });
  });

  var alreadyDone = String(qr.progress) === 'Completed';
  var blocked = qr.status === 'Disabled' || qr.status === 'Expired';
  var result = { kind: 'result', score: score, max: full.length, review: review, already: alreadyDone, points: 0 };

  if (!alreadyDone && !blocked) {
    var saved = submitResult(token, score, full.length); // records completion + points + badges
    result.points = (saved && saved.points) || 0;
  }
  return result;
}

/* ---- Hosted quiz storage (the HTML that QRAMS serves itself) ---- */
function getTaskApp(taskId) {
  var row = findOne(SHEETS.TASK_APPS, 'taskId', clean(taskId));
  return { taskId: clean(taskId), html: row ? String(row.html || '') : '' };
}
function saveTaskApp(taskId, html) {
  taskId = clean(taskId);
  if (!taskId) throw new Error('taskId is required.');
  html = String(html || '').slice(0, 49000); // Google Sheets cell cap is 50,000 chars
  var existing = findOne(SHEETS.TASK_APPS, 'taskId', taskId);
  if (existing) updateWhere(SHEETS.TASK_APPS, 'taskId', taskId, { html: html, updatedAt: nowIso() });
  else appendRow(SHEETS.TASK_APPS, { taskId: taskId, html: html, updatedAt: nowIso() });
  updateWhere(SHEETS.TASKS, 'taskId', taskId, { appType: 'hosted' }); // route scans to the quiz
  invalidateDashboard();
  return { taskId: taskId, length: html.length };
}
function deleteTaskApp(taskId) {
  taskId = clean(taskId);
  deleteWhere(SHEETS.TASK_APPS, 'taskId', taskId);
  updateWhere(SHEETS.TASKS, 'taskId', taskId, { appType: 'link' });
  return { taskId: taskId };
}

/* ================= EXAM PAPER → QUIZ (AI extraction) ================= */
/* A teacher uploads a photo/PDF of an exam paper; we send it to the Gemini API
   (the school's own free key, stored server-side in Script Properties — never
   exposed to the browser) and get back structured questions for the builder.
   The teacher ALWAYS reviews the ticked answers before saving. */

var GEMINI_MODEL = 'gemini-2.5-flash'; // free-tier multimodal model; change here if Google renames it

/** Admin-only: store (or clear, with '') the Gemini API key. Never returned to clients. */
function saveGeminiKey(key) {
  key = String(key || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (!key) { props.deleteProperty('GEMINI_API_KEY'); return { set: false }; }
  props.setProperty('GEMINI_API_KEY', key);
  return { set: true };
}

/** Is a key configured? (Only a yes/no — the key itself stays server-side.) */
function hasGeminiKey() {
  return { set: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') };
}

/**
 * Read an exam paper and return builder-ready questions.
 * Accepts ONE base64 file (photo/PDF) — or, for multi-page papers, an array
 * `files` of {data, mime} (up to 6 photos read together as a single paper).
 * Throws clear, teacher-friendly errors.
 */
function extractQuiz(fileBase64, mimeType, files) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('No AI key set yet. An admin can add a free Gemini key in Settings (aistudio.google.com).');

  // Normalise input to a list of pages.
  var list = [];
  if (files && files.length) {
    for (var i = 0; i < Math.min(files.length, 6); i++) {
      if (files[i] && files[i].data) list.push({ data: String(files[i].data), mime: String(files[i].mime || 'image/jpeg') });
    }
  } else if (fileBase64) {
    list.push({ data: String(fileBase64), mime: String(mimeType || 'image/jpeg') });
  }
  if (!list.length) throw new Error('No file received.');
  for (var v = 0; v < list.length; v++) {
    if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].indexOf(list[v].mime) === -1) {
      throw new Error('Please upload photos (JPG/PNG) or a PDF.');
    }
  }

  var prompt =
    'You are reading a school exam paper (it may be in Malay or English). ' +
    (list.length > 1 ? 'The paper spans ' + list.length + ' photos — read them in order as ONE paper. ' : '') +
    'Extract EVERY multiple-choice question exactly as written, keeping the original language. ' +
    'For each question, also determine the correct answer yourself. ' +
    'Skip essay, fill-in-the-blank and matching questions. Maximum 50 questions. ' +
    'Output ONLY a JSON array, no other text, in exactly this format: ' +
    '[{"q":"question text","options":["first option","second option","third option","fourth option"],"correct":1}] ' +
    'where "correct" is the position of the right option counting from 1. ' +
    'If the paper has no multiple-choice questions, output [].';

  var parts = list.map(function (f) { return { inline_data: { mime_type: f.mime, data: f.data } }; });
  parts.push({ text: prompt });

  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(key),
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    }
  );

  var code = res.getResponseCode();
  var txt = res.getContentText();
  if (code !== 200) {
    var msg = 'AI request failed (HTTP ' + code + ').';
    try { var ej = JSON.parse(txt); if (ej.error && ej.error.message) msg = 'AI error: ' + String(ej.error.message).slice(0, 200); } catch (e) {}
    throw new Error(msg);
  }

  var out = '';
  try { var j = JSON.parse(txt); out = j.candidates[0].content.parts[0].text; }
  catch (e) { throw new Error('Unexpected AI response — please try again.'); }

  var m = String(out).match(/\[[\s\S]*\]/);
  if (!m) throw new Error('The AI could not find quiz questions in that file.');
  var arr;
  try { arr = JSON.parse(m[0]); } catch (e) { throw new Error('The AI reply was not valid JSON — please try again.'); }

  var letters = ['A', 'B', 'C', 'D'];
  var qs = [];
  (arr || []).forEach(function (x) {
    var qText = String(x.q || x.question || '').trim();
    var opts = (x.options || []).map(function (o) { return String(o).trim(); }).filter(String).slice(0, 4);
    if (!qText || opts.length < 2) return;
    var c = x.correct, letter = 'A';
    if (typeof c === 'string' && /^[A-Da-d]$/.test(c.trim())) letter = c.trim().toUpperCase();
    else { var n = Number(c); letter = letters[(n >= 1 && n <= opts.length) ? n - 1 : 0] || 'A'; }
    qs.push({ question: qText, options: opts, correct: letter });
  });
  if (!qs.length) throw new Error('No multiple-choice questions were found in that file.');
  return { questions: qs.slice(0, 50), model: GEMINI_MODEL };
}

/* ========================= 7. DASHBOARD ========================= */

/** Cache key for the computed dashboard. */
function invalidateDashboard() {
  CacheService.getScriptCache().remove('dashboard');
}

/**
 * Aggregate everything the dashboard needs in ONE pass and cache it.
 * Recomputed at most every CONFIG.CACHE_SECONDS, or when data changes.
 */
function getDashboard() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('dashboard');
  if (cached) return JSON.parse(cached);

  var tasks = listTasks();
  var qrs = listQRCodes();
  var scans = readAll(SHEETS.SCAN_LOGS);
  var today = new Date(); today.setHours(0, 0, 0, 0);

  var completed = qrs.filter(function (q) { return q.progress === 'Completed'; }).length;
  var activeQR = qrs.filter(function (q) { return q.status === 'Active'; }).length;

  // Overdue: not completed and its task's dueDate has passed.
  var taskById = {};
  tasks.forEach(function (t) { taskById[t.taskId] = t; });
  var overdue = qrs.filter(function (q) {
    var t = taskById[q.taskId];
    if (!t || !t.dueDate || q.progress === 'Completed') return false;
    return new Date(t.dueDate) < today;
  }).length;

  // Scans today + a 7-day daily series.
  var dayKey = function (d) { return new Date(d).toISOString().slice(0, 10); };
  var dailyMap = {};
  for (var i = 6; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i);
    dailyMap[dayKey(d)] = 0;
  }
  var scansToday = 0;
  var hourMap = {}; // peak-time heatmap (0-23)
  scans.forEach(function (s) {
    var k = dayKey(s.timestamp);
    if (k in dailyMap) dailyMap[k]++;
    if (new Date(s.timestamp) >= today) scansToday++;
    var h = new Date(s.timestamp).getHours();
    hourMap[h] = (hourMap[h] || 0) + 1;
  });

  // Per-class performance + student leaderboard (points + completion).
  var classAgg = {};
  var leaderboard = {};
  qrs.forEach(function (q) {
    var cls = q.className || 'Unassigned';
    classAgg[cls] = classAgg[cls] || { total: 0, done: 0 };
    classAgg[cls].total++;
    if (q.progress === 'Completed') classAgg[cls].done++;

    var key = q.entityId;
    leaderboard[key] = leaderboard[key] || { entityId: q.entityId, label: q.label, className: cls, points: 0, completed: 0 };
    leaderboard[key].points += Number(q.points) || 0;
    if (q.progress === 'Completed') leaderboard[key].completed++;
  });

  var result = {
    cards: {
      totalTasks: tasks.length,
      activeQR: activeQR,
      totalQR: qrs.length,
      completed: completed,
      overdue: overdue,
      completionRate: qrs.length ? Math.round((completed / qrs.length) * 100) : 0,
      scansToday: scansToday,
      totalScans: scans.length,
    },
    statusBreakdown: countBy(qrs, 'progress', ENUMS.progress),
    daily: Object.keys(dailyMap).map(function (k) { return { date: k, count: dailyMap[k] }; }),
    hourly: buildHourly(hourMap),
    classPerformance: Object.keys(classAgg).map(function (c) {
      return { className: c, total: classAgg[c].total, done: classAgg[c].done,
        rate: Math.round((classAgg[c].done / classAgg[c].total) * 100) };
    }),
    leaderboard: Object.keys(leaderboard).map(function (k) { return leaderboard[k]; })
      .sort(function (a, b) { return b.points - a.points || b.completed - a.completed; })
      .slice(0, 10),
    generatedAt: nowIso(),
  };

  cache.put('dashboard', JSON.stringify(result), CONFIG.CACHE_SECONDS);
  return result;
}

/** Count rows by a field, returning all enum keys (even zero) in order. */
function countBy(rows, field, allKeys) {
  var counts = {};
  allKeys.forEach(function (k) { counts[k] = 0; });
  rows.forEach(function (r) {
    var v = r[field] || 'Not Started';
    counts[v] = (counts[v] || 0) + 1;
  });
  return allKeys.map(function (k) { return { label: k, count: counts[k] }; });
}

function buildHourly(hourMap) {
  var out = [];
  for (var h = 0; h < 24; h++) out.push({ hour: h, count: hourMap[h] || 0 });
  return out;
}

/* ========================= SETTINGS ========================= */

function getSettings() {
  var out = {};
  readAll(SHEETS.SETTINGS).forEach(function (r) { out[r.key] = r.value; });
  return out;
}

function saveSetting(key, value) {
  // If the gamification switch changed, drop its cached value immediately.
  if (key === 'gamificationEnabled') CacheService.getScriptCache().remove('gamiOn');
  var existing = findOne(SHEETS.SETTINGS, 'key', key);
  if (existing) return updateWhere(SHEETS.SETTINGS, 'key', key, { value: clean(value), updatedAt: nowIso() });
  return appendRow(SHEETS.SETTINGS, { key: clean(key), value: clean(value), updatedAt: nowIso() });
}

/* ========================= DELETIONS ========================= */
/* All destructive and admin/teacher-only (enforced in Code.gs); the frontend
   always asks the user to confirm first. Cascades clean up child rows so the
   database never keeps orphaned QR codes or logs. */

/** Delete a task AND its QR codes, scan logs, completion logs and points. */
function deleteTask(taskId) {
  if (!findOne(SHEETS.TASKS, 'taskId', taskId)) throw new Error('Task not found.');
  var qrCount = findWhere(SHEETS.QR_CODES, 'taskId', taskId).length;
  deleteAllWhere(SHEETS.SCAN_LOGS, 'taskId', taskId);
  deleteAllWhere(SHEETS.COMPLETION_LOGS, 'taskId', taskId);
  deleteAllWhere(SHEETS.POINTS_LOG, 'taskId', taskId);
  deleteAllWhere(SHEETS.QR_CODES, 'taskId', taskId);
  deleteWhere(SHEETS.TASK_APPS, 'taskId', taskId);            // remove any hosted quiz too
  deleteAllWhere(SHEETS.QUIZ_QUESTIONS, 'taskId', taskId);    // and built-in quiz questions
  deleteWhere(SHEETS.TASKS, 'taskId', taskId);
  invalidateDashboard();
  return { deleted: taskId, qrCodes: qrCount };
}

/** Delete one student (any QR codes they own stay intact and still scannable). */
function deleteStudent(studentId) {
  if (!findOne(SHEETS.STUDENTS, 'studentId', studentId)) throw new Error('Student not found.');
  deleteWhere(SHEETS.STUDENTS, 'studentId', studentId);
  return { deleted: studentId };
}

/** Bulk-delete many students in one go (from the Students page selection). */
function deleteStudents(ids) {
  if (!ids || !ids.length) throw new Error('No students selected.');
  var n = deleteManyWhere(SHEETS.STUDENTS, 'studentId', ids);
  invalidateDashboard();
  return { deleted: n };
}

/** Delete one QR code and its scan + completion history. */
function deleteQR(token) {
  if (!getQR(token)) throw new Error('QR not found.');
  deleteAllWhere(SHEETS.SCAN_LOGS, 'token', token);
  deleteAllWhere(SHEETS.COMPLETION_LOGS, 'token', token);
  deleteWhere(SHEETS.QR_CODES, 'token', token);
  invalidateDashboard();
  return { deleted: token };
}

/** Delete a campaign. Its tasks are kept but un-grouped (campaignId cleared). */
function deleteCampaign(campaignId) {
  if (!findOne(SHEETS.CAMPAIGNS, 'campaignId', campaignId)) throw new Error('Campaign not found.');
  readAll(SHEETS.TASKS).forEach(function (t) {
    if (String(t.campaignId) === String(campaignId)) updateWhere(SHEETS.TASKS, 'taskId', t.taskId, { campaignId: '' });
  });
  deleteWhere(SHEETS.CAMPAIGNS, 'campaignId', campaignId);
  invalidateDashboard();
  return { deleted: campaignId };
}
