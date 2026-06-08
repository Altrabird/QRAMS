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
  var common = {
    campaignId: clean(payload.campaignId),
    title: clean(payload.title), description: clean(payload.description),
    subject: clean(payload.subject), teacherName: clean(payload.teacherName),
    dueDate: clean(payload.dueDate), category: clean(payload.category),
    masterLink: cleanUrl(payload.masterLink),
    completionMode: clean(payload.completionMode) || 'auto',
    pointsValue: Number(payload.pointsValue) || 0,
    status: clean(payload.status) || 'Active',
    updatedAt: nowIso(),
  };
  if (!common.title) throw new Error('Task title is required.');
  if (!common.masterLink) throw new Error('A valid http(s) master link is required.');

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
    var link = cleanUrl(task.masterLink) || CONFIG.FALLBACK_REDIRECT;

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
