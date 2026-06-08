/**
 * QRAMS - QR Assignment Management System  .  BACKEND (Google Apps Script)
 * =============================================================================
 * ALL backend code in ONE file, ready to paste into the Apps Script editor that
 * is bound to your QRAMS Google Sheet (Extensions > Apps Script).
 *
 * HOW TO USE (full steps are in the chat):
 *   1) Open your QRAMS Google Sheet > Extensions > Apps Script.
 *   2) In Code.gs, delete the sample myFunction(), paste THIS whole file, Save.
 *   3) Run setupDatabase once and authorise when asked.
 *   4) Deploy > New deployment > Web app  ->  copy the /exec URL.
 *
 * Google Apps Script loads every .gs file into one shared scope, so keeping all
 * the code in a single file works exactly like the separate files in the repo.
 * Version 1.0.0 (Phase 2).
 * =============================================================================
 */



/* ==========================================================================
 * FILE 1/9  -  Config.gs
 * ======================================================================== */
/**
 * Config.gs
 * =============================================================================
 * SINGLE SOURCE OF TRUTH for the whole backend.
 *
 * Every sheet name and every column lives here. The rest of the code reads
 * columns BY NAME (never by a hard-coded number), so you can safely add a
 * column to any sheet below and nothing else breaks.
 *
 * Beginner tip: if you want a new field, just add its name to the SCHEMA array
 * for that sheet, re-run `setupDatabase()`, and it appears everywhere.
 * =============================================================================
 */

/** App-wide settings. */
const CONFIG = {
  APP_NAME: 'QRAMS — QR Assignment Management System',
  VERSION: '1.0.0',

  // How long (seconds) to cache hot lookups (token -> task) and the dashboard.
  CACHE_SECONDS: 300,

  // Default master link used if a QR's task somehow has none (safety net).
  FALLBACK_REDIRECT: 'https://www.google.com',

  // Roles allowed in the system.
  ROLES: ['admin', 'teacher', 'viewer'],
};

/**
 * Sheet (tab) names. Keep them here so a rename is a one-line change.
 */
const SHEETS = {
  USERS: 'Users',
  CAMPAIGNS: 'Campaigns',
  TASKS: 'Tasks',
  STUDENTS: 'Students',
  GROUPS: 'Groups',
  QR_CODES: 'QR_Codes',
  SCAN_LOGS: 'Scan_Logs',
  COMPLETION_LOGS: 'Completion_Logs',
  SETTINGS: 'Settings',
  // ---- Phase 2 stubs (created empty + documented, no UI yet) ----
  POINTS_LOG: 'Points_Log',
  BADGES: 'Badges',
  REWARDS: 'Rewards',
  ATTENDANCE: 'Attendance',
  TEACHER_NOTES: 'Teacher_Notes',
  // ---- Phase 2 (now live) ----
  STUDENT_BADGES: 'Student_Badges', // which pupil earned which badge (1 row each)
  CERTIFICATES: 'Certificates',     // issued, QR-verifiable certificates
};

/**
 * Column schema for each sheet (the header row).
 * Order here = column order in the sheet.
 */
const SCHEMA = {
  Users: ['userId', 'name', 'email', 'role', 'pinHash', 'status', 'createdAt'],

  Campaigns: [
    'campaignId', 'name', 'description', 'subject', 'program',
    'startDate', 'endDate', 'status', 'teacherInCharge', 'notes', 'createdAt',
  ],

  Tasks: [
    'taskId', 'campaignId', 'title', 'description', 'subject', 'teacherName',
    'dueDate', 'category', 'masterLink', 'completionMode', 'pointsValue',
    'status', 'createdAt', 'updatedAt',
  ],

  Students: ['studentId', 'name', 'className', 'groupId', 'gender', 'notes', 'createdAt'],

  Groups: ['groupId', 'name', 'className', 'memberIds', 'notes', 'createdAt'],

  QR_Codes: [
    'token', 'taskId', 'entityType', 'entityId', 'label', 'className',
    'status', 'progress', 'firstScan', 'lastScan', 'scanCount',
    'completedAt', 'points', 'remarks', 'createdAt',
  ],

  Scan_Logs: [
    'logId', 'token', 'taskId', 'entityId', 'timestamp',
    'deviceType', 'userAgent', 'action',
  ],

  Completion_Logs: [
    'logId', 'token', 'taskId', 'entityId', 'method',
    'status', 'durationSec', 'evidence', 'reviewedBy', 'notes', 'timestamp',
  ],

  Settings: ['key', 'value', 'updatedAt'],

  // ---- Phase 2 stubs ----
  Points_Log: ['logId', 'entityId', 'taskId', 'points', 'reason', 'timestamp'],
  Badges: ['badgeId', 'name', 'description', 'icon', 'criteria', 'createdAt'],
  Rewards: ['rewardId', 'name', 'description', 'cost', 'type', 'status', 'createdAt'],
  Attendance: ['logId', 'studentId', 'date', 'status', 'recordedBy', 'timestamp'],
  Teacher_Notes: ['noteId', 'entityId', 'taskId', 'author', 'type', 'note', 'timestamp'],

  // ---- Phase 2 (now live) ----
  // One row each time a pupil earns a badge (lets us never award the same one twice).
  Student_Badges: ['logId', 'entityId', 'badgeId', 'reason', 'awardedAt'],
  // One row per issued certificate. `token` is the value the QR on the cert encodes.
  Certificates: [
    'certId', 'token', 'entityId', 'entityName', 'scope', 'scopeId',
    'title', 'issuedBy', 'issuedAt', 'status',
  ],
};

/** Valid status / progress values (used for validation + UI dropdowns). */
const ENUMS = {
  campaignStatus: ['Draft', 'Active', 'Paused', 'Completed', 'Archived'],
  taskStatus: ['Active', 'Paused', 'Completed', 'Archived'],
  qrStatus: ['Active', 'Disabled', 'Completed', 'Expired'],
  progress: ['Not Started', 'Opened', 'Started', 'In Progress', 'Submitted', 'Reviewed', 'Completed'],
  completionMode: ['auto', 'manual', 'form', 'quiz', 'evidence', 'time'],
  entityType: ['student', 'group', 'class', 'teacher', 'event', 'custom'],

  // ---- Phase 2 ----
  // Badge rules live as a short text string in the Badges sheet's `criteria`
  // column. checkBadges() understands these shapes:
  //   'first_scan'        → earned on the pupil's very first scan
  //   'tasks:N'           → earned after completing N tasks   (e.g. 'tasks:5')
  //   'points:N'          → earned after reaching N points    (e.g. 'points:100')
  //   'perfect_campaign'  → earned when every task in a campaign is done
  rewardType: ['privilege', 'item', 'recognition'],
  rewardStatus: ['Active', 'Disabled'],
  certScope: ['task', 'campaign'],
  certStatus: ['Valid', 'Revoked'],
};



/* ==========================================================================
 * FILE 2/9  -  Utils.gs
 * ======================================================================== */
/**
 * Utils.gs
 * =============================================================================
 * Small, reusable helpers: ID/token generation, sanitization (XSS defense),
 * JSON responses, date formatting, device detection.
 * No business logic here — keep it generic.
 * =============================================================================
 */

/** Characters used for human-friendly random suffixes (no confusing 0/O/1/I). */
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a short random string (default 4 chars) from SAFE_CHARS.
 * Used as the unguessable suffix on QR tokens.
 */
function randomSuffix(len) {
  len = len || 4;
  var out = '';
  for (var i = 0; i < len; i++) {
    out += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
  }
  return out;
}

/**
 * Build a unique, mostly-readable QR token.
 *   makeToken('TASK001', 'STU001')  ->  'TASK001-STU001-K7Q2'
 * The random suffix prevents a pupil from guessing a neighbour's token.
 */
function makeToken(taskId, entitySeq) {
  return [taskId, entitySeq, randomSuffix(4)].join('-');
}

/**
 * Generate a sequential-style ID with a prefix, e.g. nextId('TASK', existing).
 * Looks at existing IDs, finds the highest number, returns prefix + zero-padded.
 */
function nextId(prefix, existingIds) {
  var max = 0;
  (existingIds || []).forEach(function (id) {
    var m = String(id).match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + pad(max + 1, 3);
}

/** Zero-pad a number to n digits: pad(7,3) -> '007'. */
function pad(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/** Generate a globally-unique log id (timestamp + randomness). */
function uid(prefix) {
  return (prefix || 'L') + '-' + Date.now().toString(36) + '-' + randomSuffix(3);
}

/**
 * Sanitize a string for safe storage/display. Strips tags and dangerous chars.
 * This is the first line of XSS defense (the frontend also escapes on render).
 */
function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/<\/?[^>]+(>|$)/g, '') // strip HTML tags
    .replace(/[<>]/g, '')           // strip stray angle brackets
    .trim()
    .slice(0, 2000);                // hard length cap
}

/** Validate a URL is http/https only (blocks javascript: and data: URIs). */
function cleanUrl(value) {
  var v = String(value || '').trim();
  if (!/^https?:\/\//i.test(v)) return '';
  return v.replace(/[<>"]/g, '').slice(0, 2000);
}

/** Standard JSON success response for the Web App. */
function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data === undefined ? null : data }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Standard JSON error response. */
function jsonErr(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: String(message), code: code || 'ERROR' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Format a Date (or now) as an ISO-ish string in the sheet's timezone. */
function nowIso() {
  return new Date().toISOString();
}

/** Rough device type from a user-agent string. */
function deviceFromUA(ua) {
  ua = String(ua || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'mobile';
  if (!ua) return 'unknown';
  return 'desktop';
}

/** Escape a string for safe insertion into HTML (used by the redirect/verify pages). */
function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Simple non-cryptographic hash for PINs (good enough for a school kiosk). */
function hashPin(pin) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'qrams-salt::' + String(pin)
  );
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}



/* ==========================================================================
 * FILE 3/9  -  Database.gs
 * ======================================================================== */
/**
 * Database.gs
 * =============================================================================
 * A tiny, generic layer over Google Sheets. Everything reads/writes rows as
 * plain objects keyed by the header row, so callers never deal with column
 * numbers. All writes go through LockService to prevent race conditions when
 * two scans hit at the same moment.
 *
 * Performance notes for 10,000+ rows:
 *  - We read a whole sheet in ONE getValues() call (fast), then work in memory.
 *  - We write in batches where possible (appendRows).
 *  - Hot read paths (token lookup, dashboard) are cached in Api.gs.
 * =============================================================================
 */

/** Return the active spreadsheet (the one this script is bound to or configured). */
function getBook() {
  // If you bind this script to a Sheet, getActive() works. Otherwise set the
  // ID in Script Properties under key 'SPREADSHEET_ID' (see Setup.gs).
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Get a sheet by name, throwing a clear error if setup hasn't run. */
function getSheet(name) {
  var sh = getBook().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found. Run setupDatabase() first.');
  return sh;
}

/** Header row (array of column names) for a sheet. */
function getHeaders(name) {
  var sh = getSheet(name);
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

/**
 * Read ALL rows of a sheet as objects: [{col: value, ...}, ...].
 * Empty sheets (header only) return [].
 */
function readAll(name) {
  var sh = getSheet(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol === 0) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(String);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c];
    out.push(obj);
  }
  return out;
}

/** Find the first row (as object) where keyCol === keyVal, or null. */
function findOne(name, keyCol, keyVal) {
  var rows = readAll(name);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][keyCol]) === String(keyVal)) return rows[i];
  }
  return null;
}

/** Return all rows where keyCol === keyVal. */
function findWhere(name, keyCol, keyVal) {
  return readAll(name).filter(function (r) {
    return String(r[keyCol]) === String(keyVal);
  });
}

/** Convert an object to a row array in the sheet's header order. */
function objToRow(name, obj) {
  return getHeaders(name).map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
}

/** Append a single object as a new row (lock-protected). */
function appendRow(name, obj) {
  return withLock(function () {
    getSheet(name).appendRow(objToRow(name, obj));
    return obj;
  });
}

/** Append many objects in ONE batch write (lock-protected). Fast for bulk. */
function appendRows(name, objs) {
  if (!objs || !objs.length) return [];
  return withLock(function () {
    var sh = getSheet(name);
    var rows = objs.map(function (o) { return objToRow(name, o); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return objs;
  });
}

/**
 * Update the first row where keyCol === keyVal by merging patch (lock-protected).
 * Returns the merged object, or null if not found.
 */
function updateWhere(name, keyCol, keyVal, patch) {
  return withLock(function () {
    var sh = getSheet(name);
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return null;
    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = values[0].map(String);
    var keyIdx = headers.indexOf(keyCol);
    if (keyIdx === -1) throw new Error('Column "' + keyCol + '" not in ' + name);

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][keyIdx]) === String(keyVal)) {
        var merged = {};
        headers.forEach(function (h, c) { merged[h] = values[r][c]; });
        Object.keys(patch).forEach(function (k) {
          merged[k] = patch[k];
          var ci = headers.indexOf(k);
          if (ci !== -1) values[r][ci] = patch[k];
        });
        sh.getRange(r + 1, 1, 1, lastCol).setValues([values[r]]);
        return merged;
      }
    }
    return null;
  });
}

/** Delete the first row where keyCol === keyVal. Returns true if deleted. */
function deleteWhere(name, keyCol, keyVal) {
  return withLock(function () {
    var sh = getSheet(name);
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return false;
    var headers = getHeaders(name);
    var keyIdx = headers.indexOf(keyCol);
    var col = sh.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]) === String(keyVal)) {
        sh.deleteRow(i + 2);
        return true;
      }
    }
    return false;
  });
}

/**
 * Run a function while holding the script lock. Prevents two concurrent scans
 * from corrupting scanCount or writing duplicate rows.
 */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // wait up to 20s for other writers
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}



/* ==========================================================================
 * FILE 4/9  -  Auth.gs
 * ======================================================================== */
/**
 * Auth.gs
 * =============================================================================
 * Lightweight, school-friendly authentication.
 *
 *  - Login with email + PIN. We store only a hash of the PIN (never the PIN).
 *  - On success we mint a random session token, cache it server-side for 6h,
 *    and return it. The frontend sends it back on every write request.
 *  - Roles: admin (full), teacher (manage own tasks), viewer (read-only).
 *  - SCANNING NEEDS NO LOGIN — pupils just scan and go.
 *
 * This is intentionally simple (a kiosk in a classroom, not a bank). It keeps
 * casual users out and ties writes to a named teacher for the audit trail.
 * =============================================================================
 */

var SESSION_TTL = 6 * 60 * 60; // 6 hours in seconds

/** Log in. Returns { token, user } or throws. */
function login(email, pin) {
  email = clean(email).toLowerCase();
  var user = null;
  readAll(SHEETS.USERS).forEach(function (u) {
    if (String(u.email).toLowerCase() === email) user = u;
  });
  if (!user) throw new Error('No account for that email.');
  if (String(user.status) !== 'Active') throw new Error('Account is not active.');
  if (String(user.pinHash) !== hashPin(pin)) throw new Error('Wrong PIN.');

  var token = uid('S') + randomSuffix(8);
  var session = { userId: user.userId, name: user.name, role: user.role, email: user.email };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), SESSION_TTL);

  return { token: token, user: session };
}

/** Resolve a session token to a user, or null if invalid/expired. */
function getSession(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('sess_' + clean(token));
  return raw ? JSON.parse(raw) : null;
}

/** Throw unless the session has one of the allowed roles. Returns the session. */
function requireRole(token, allowedRoles) {
  var s = getSession(token);
  if (!s) throw new Error('Not signed in (session expired). Please log in again.');
  if (allowedRoles && allowedRoles.indexOf(s.role) === -1) {
    throw new Error('Your role (' + s.role + ') cannot perform this action.');
  }
  return s;
}

/** Log out (invalidate the session token). */
function logout(token) {
  CacheService.getScriptCache().remove('sess_' + clean(token));
  return true;
}

/** Admin-only: create a new user with a starting PIN. */
function createUser(session, payload) {
  var ids = readAll(SHEETS.USERS).map(function (u) { return u.userId; });
  var user = {
    userId: nextId('U', ids),
    name: clean(payload.name),
    email: clean(payload.email).toLowerCase(),
    role: ENUMS && CONFIG.ROLES.indexOf(payload.role) !== -1 ? payload.role : 'teacher',
    pinHash: hashPin(payload.pin || '1234'),
    status: 'Active',
    createdAt: nowIso(),
  };
  appendRow(SHEETS.USERS, user);
  delete user.pinHash;
  return user;
}



/* ==========================================================================
 * FILE 5/9  -  Api.gs
 * ======================================================================== */
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
    var groups = listGroups();
    var byG = {};
    groups.forEach(function (g) { byG[g.groupId] = g; });
    return (payload.entityIds || []).map(function (id) {
      var g = byG[id] || {};
      return { entityType: 'group', entityId: id, label: g.name || id, className: g.className || '' };
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



/* ==========================================================================
 * FILE 6/9  -  Gamification.gs
 * ======================================================================== */
/**
 * Gamification.gs  — POINTS · BADGES · LEADERBOARD · REWARDS
 * =============================================================================
 * Phase 2. Everything here is OPTIONAL: it only runs when the school turns on
 * the `gamificationEnabled` setting. When it's off, scans behave exactly like
 * Phase 1 (no extra work, no slowdown).
 *
 * Design (kept deliberately simple):
 *  - POINTS are an append-only LEDGER (Points_Log). Earning = a positive row,
 *    spending a reward = a negative row. A pupil's balance = the sum of rows.
 *    This gives a full history and makes rewards "just work".
 *  - BADGES: definitions live in the Badges sheet; the moment a pupil earns one
 *    we write a row to Student_Badges so we never award the same badge twice.
 *  - Heavy reads (totals, badge checks) happen on completion only, and the
 *    dashboard/leaderboard results are cached — so the scan path stays fast.
 * =============================================================================
 */

/* ----------------------- master on/off switch ----------------------- */

/**
 * Is gamification switched on? Cached for 60s so we don't read the Settings
 * sheet on every single scan. saveSetting() clears this cache instantly.
 */
function isGamificationOn() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('gamiOn');
  if (cached !== null) return cached === '1';
  var on = String((getSettings() || {}).gamificationEnabled) === 'true';
  cache.put('gamiOn', on ? '1' : '0', 60);
  return on;
}

/* ============================= POINTS ============================= */

/** Add (or subtract, if negative) points for a pupil. Appends one ledger row. */
function awardPoints(entityId, taskId, points, reason) {
  entityId = clean(entityId);
  points = Number(points) || 0;
  if (!entityId || !points) return null; // nothing to record
  var row = {
    logId: uid('PT'), entityId: entityId, taskId: clean(taskId),
    points: points, reason: clean(reason), timestamp: nowIso(),
  };
  appendRow(SHEETS.POINTS_LOG, row);
  invalidateDashboard();
  return row;
}

/** A single pupil's current points balance (sum of their ledger rows). */
function getStudentPoints(entityId) {
  return findWhere(SHEETS.POINTS_LOG, 'entityId', entityId)
    .reduce(function (sum, r) { return sum + (Number(r.points) || 0); }, 0);
}

/** Map of every pupil's balance: { entityId: total }. One pass over the ledger. */
function getAllPoints() {
  var map = {};
  readAll(SHEETS.POINTS_LOG).forEach(function (r) {
    map[r.entityId] = (map[r.entityId] || 0) + (Number(r.points) || 0);
  });
  return map;
}

/* ============================= BADGES ============================= */

function listBadges() { return readAll(SHEETS.BADGES); }

/** Create or update a badge definition (admin/teacher). */
function saveBadge(payload) {
  var common = {
    name: clean(payload.name), description: clean(payload.description),
    icon: clean(payload.icon) || '🏅', criteria: clean(payload.criteria),
  };
  if (!common.name) throw new Error('Badge name is required.');
  if (payload.badgeId) return updateWhere(SHEETS.BADGES, 'badgeId', payload.badgeId, common);
  var ids = readAll(SHEETS.BADGES).map(function (b) { return b.badgeId; });
  common.badgeId = nextId('B', ids);
  common.createdAt = nowIso();
  appendRow(SHEETS.BADGES, common);
  return common;
}

/** Give a pupil a badge, but only if they don't already have it. */
function awardBadge(entityId, badgeId, reason) {
  var has = findWhere(SHEETS.STUDENT_BADGES, 'entityId', entityId)
    .some(function (r) { return String(r.badgeId) === String(badgeId); });
  if (has) return null;
  var row = {
    logId: uid('BDG'), entityId: clean(entityId), badgeId: clean(badgeId),
    reason: clean(reason), awardedAt: nowIso(),
  };
  appendRow(SHEETS.STUDENT_BADGES, row);
  return row;
}

/**
 * Check every badge rule for one pupil and award any newly-earned badges.
 * Called after a task is completed (and on every scan, for 'first_scan').
 * Returns the list of badges just awarded (for a nice "you earned X!" message).
 */
function checkBadges(entityId) {
  if (!isGamificationOn()) return [];
  var badges = listBadges();
  if (!badges.length) return [];

  // Already-earned set, so we skip them quickly.
  var earned = {};
  findWhere(SHEETS.STUDENT_BADGES, 'entityId', entityId)
    .forEach(function (r) { earned[r.badgeId] = true; });

  // Compute the stats the rules need — once.
  var myQrs = findWhere(SHEETS.QR_CODES, 'entityId', entityId);
  var stats = {
    entityId: entityId,
    completed: myQrs.filter(function (q) { return q.progress === 'Completed'; }).length,
    scans: myQrs.reduce(function (n, q) { return n + (Number(q.scanCount) || 0); }, 0),
    points: getStudentPoints(entityId),
  };

  var newly = [];
  badges.forEach(function (b) {
    if (earned[b.badgeId]) return;            // already has it
    if (badgeMet(b.criteria, stats)) {
      awardBadge(entityId, b.badgeId, 'Auto: ' + b.criteria);
      newly.push(b);
    }
  });
  return newly;
}

/** Decide whether a badge's criteria string is satisfied by the pupil's stats. */
function badgeMet(criteria, stats) {
  criteria = String(criteria || '').trim();
  if (criteria === 'first_scan') return stats.scans >= 1;
  if (criteria === 'perfect_campaign') return hasPerfectCampaign(stats.entityId);
  var m = criteria.match(/^(tasks|points):(\d+)$/);
  if (m) {
    var n = parseInt(m[2], 10);
    if (m[1] === 'tasks') return stats.completed >= n;
    if (m[1] === 'points') return stats.points >= n;
  }
  return false;
}

/** True if the pupil has at least one campaign where ALL their tasks are done. */
function hasPerfectCampaign(entityId) {
  var myQrs = findWhere(SHEETS.QR_CODES, 'entityId', entityId);
  if (!myQrs.length) return false;
  var campOf = {};
  listTasks().forEach(function (t) { campOf[t.taskId] = t.campaignId || ''; });
  var byCamp = {};
  myQrs.forEach(function (q) {
    var c = campOf[q.taskId] || '';
    if (!c) return;
    byCamp[c] = byCamp[c] || { total: 0, done: 0 };
    byCamp[c].total++;
    if (q.progress === 'Completed') byCamp[c].done++;
  });
  return Object.keys(byCamp).some(function (c) {
    return byCamp[c].total > 0 && byCamp[c].total === byCamp[c].done;
  });
}

/** Badges a pupil has earned, joined with their definitions (icon, name, …). */
function getStudentBadges(entityId) {
  var defs = {};
  listBadges().forEach(function (b) { defs[b.badgeId] = b; });
  return findWhere(SHEETS.STUDENT_BADGES, 'entityId', entityId).map(function (e) {
    var d = defs[e.badgeId] || {};
    return {
      badgeId: e.badgeId, name: d.name || e.badgeId, icon: d.icon || '🏅',
      description: d.description || '', awardedAt: e.awardedAt,
    };
  });
}

/* =========================== LEADERBOARD =========================== */

/**
 * Ranked list of pupils by points (then by tasks completed). Optionally
 * filtered to one class. Joins in points (ledger) and badge counts.
 */
function getLeaderboard(filterClass) {
  var pointsMap = getAllPoints();
  var badgeCount = {};
  readAll(SHEETS.STUDENT_BADGES).forEach(function (r) {
    badgeCount[r.entityId] = (badgeCount[r.entityId] || 0) + 1;
  });

  var board = {};
  readAll(SHEETS.QR_CODES).forEach(function (q) {
    if (q.entityType !== 'student' && q.entityType !== 'group') return;
    if (filterClass && String(q.className) !== String(filterClass)) return;
    var k = q.entityId;
    board[k] = board[k] || { entityId: q.entityId, label: q.label, className: q.className || '', completed: 0 };
    if (q.progress === 'Completed') board[k].completed++;
  });

  return Object.keys(board).map(function (k) {
    var b = board[k];
    b.points = pointsMap[k] || 0;
    b.badges = badgeCount[k] || 0;
    return b;
  }).sort(function (a, b) {
    return b.points - a.points || b.completed - a.completed;
  });
}

/* ============================= REWARDS ============================= */

function listRewards() { return readAll(SHEETS.REWARDS); }

/** Create or update a reward (admin/teacher). */
function saveReward(payload) {
  var common = {
    name: clean(payload.name), description: clean(payload.description),
    cost: Number(payload.cost) || 0,
    type: ENUMS.rewardType.indexOf(payload.type) !== -1 ? payload.type : 'item',
    status: ENUMS.rewardStatus.indexOf(payload.status) !== -1 ? payload.status : 'Active',
  };
  if (!common.name) throw new Error('Reward name is required.');
  if (payload.rewardId) return updateWhere(SHEETS.REWARDS, 'rewardId', payload.rewardId, common);
  var ids = readAll(SHEETS.REWARDS).map(function (r) { return r.rewardId; });
  common.rewardId = nextId('R', ids);
  common.createdAt = nowIso();
  appendRow(SHEETS.REWARDS, common);
  return common;
}

/**
 * Redeem a reward for a pupil. Checks they can afford it, then records the
 * spend as a NEGATIVE ledger row (so their balance updates automatically).
 */
function redeemReward(payload) {
  var reward = findOne(SHEETS.REWARDS, 'rewardId', payload.rewardId);
  if (!reward) throw new Error('Reward not found.');
  if (String(reward.status) === 'Disabled') throw new Error('That reward is switched off.');

  var entityId = clean(payload.entityId);
  if (!entityId) throw new Error('Choose a pupil to redeem for.');

  var balance = getStudentPoints(entityId);
  var cost = Number(reward.cost) || 0;
  if (balance < cost) throw new Error('Not enough points (' + balance + ' / ' + cost + ').');

  awardPoints(entityId, '', -cost, 'reward:' + reward.rewardId + ' — ' + reward.name);
  return { entityId: entityId, spent: cost, balance: balance - cost, reward: reward.name };
}



/* ==========================================================================
 * FILE 7/9  -  Certificates.gs
 * ======================================================================== */
/**
 * Certificates.gs  — PRINTABLE, QR-VERIFIABLE CERTIFICATES
 * =============================================================================
 * Phase 2. A teacher issues a certificate to a pupil for finishing a task or a
 * whole campaign. Each certificate gets a random `token`; the printed cert
 * carries a QR encoding  <webapp>/exec?cert=<token>.  Anyone who scans it lands
 * on a verify page proving it's genuine (or that it was revoked / fake).
 *
 * The verify page reuses the SAME doGet redirect pattern as a normal scan, so
 * there's no new infrastructure — see verifyPage() in Code.gs.
 * =============================================================================
 */

/** One certificate by its verify token (used to render / reprint it). */
function getCertificate(token) {
  return findOne(SHEETS.CERTIFICATES, 'token', clean(token));
}

/** All certificates, optionally only those for one task/campaign (scopeId). */
function listCertificates(scopeId) {
  var all = readAll(SHEETS.CERTIFICATES);
  if (!scopeId) return all;
  return all.filter(function (c) { return String(c.scopeId) === String(scopeId); });
}

/**
 * Issue a certificate.
 * payload = {
 *   entityId,            // who it's for (e.g. STU001)
 *   entityName?,         // optional friendly name snapshot
 *   scope: 'task'|'campaign',
 *   scopeId,             // taskId or campaignId
 *   title?,              // optional custom heading
 *   issuedBy?            // teacher name
 * }
 */
function issueCertificate(payload) {
  var scope = ENUMS.certScope.indexOf(payload.scope) !== -1 ? payload.scope : 'task';
  var entityId = clean(payload.entityId);
  if (!entityId) throw new Error('Choose who the certificate is for.');

  // Snapshot a friendly name so the cert still reads well if records change later.
  var entityName = clean(payload.entityName);
  if (!entityName) {
    var stu = findOne(SHEETS.STUDENTS, 'studentId', entityId);
    entityName = stu ? stu.name : entityId;
  }

  // Build a default title from the task/campaign if none was given.
  var title = clean(payload.title);
  if (!title) {
    if (scope === 'campaign') {
      var camp = findOne(SHEETS.CAMPAIGNS, 'campaignId', payload.scopeId);
      title = 'Certificate of Completion — ' + (camp ? camp.name : clean(payload.scopeId));
    } else {
      var task = findOne(SHEETS.TASKS, 'taskId', payload.scopeId);
      title = 'Certificate of Completion — ' + (task ? task.title : clean(payload.scopeId));
    }
  }

  var ids = readAll(SHEETS.CERTIFICATES).map(function (c) { return c.certId; });
  var cert = {
    certId: nextId('CERT', ids),
    token: 'CERT-' + randomSuffix(8),  // the value the verify QR encodes
    entityId: entityId, entityName: entityName,
    scope: scope, scopeId: clean(payload.scopeId),
    title: title, issuedBy: clean(payload.issuedBy),
    issuedAt: nowIso(), status: 'Valid',
  };
  appendRow(SHEETS.CERTIFICATES, cert);
  return cert;
}

/** Mark a certificate as no longer valid (e.g. issued by mistake). */
function revokeCertificate(token) {
  var updated = updateWhere(SHEETS.CERTIFICATES, 'token', clean(token), { status: 'Revoked' });
  if (!updated) throw new Error('Certificate not found.');
  return updated;
}

/**
 * PUBLIC check (no login) used by the verify page when a cert QR is scanned.
 * Returns a small, safe object describing the result.
 */
function verifyCertificate(token) {
  var c = findOne(SHEETS.CERTIFICATES, 'token', clean(token));
  if (!c) return { valid: false, message: 'No certificate matches this code.' };
  if (String(c.status) !== 'Valid') return { valid: false, message: 'This certificate has been revoked.' };
  return {
    valid: true, certId: c.certId, entityName: c.entityName,
    title: c.title, issuedBy: c.issuedBy, issuedAt: c.issuedAt,
  };
}



/* ==========================================================================
 * FILE 8/9  -  Setup.gs
 * ======================================================================== */
/**
 * Setup.gs
 * =============================================================================
 * ONE-CLICK INSTALLER.
 *
 * In the Apps Script editor, select `setupDatabase` from the function dropdown
 * and click Run. It will:
 *   1. Create every sheet defined in SHEETS / SCHEMA (if missing).
 *   2. Write the header row and freeze it.
 *   3. Add dropdown validation for status/progress columns.
 *   4. Seed a sample admin user, campaign, task, students and QR codes so you
 *      can see the dashboard working immediately.
 *
 * Safe to run more than once — it never deletes your data, only adds what's
 * missing. To wipe and reseed, run `resetDatabase()` (DESTROYS all rows).
 * =============================================================================
 */

function setupDatabase() {
  var book = getBook();

  // Remember the spreadsheet id so the script works even when run standalone.
  PropertiesService.getScriptProperties()
    .setProperty('SPREADSHEET_ID', book.getId());

  Object.keys(SCHEMA).forEach(function (sheetName) {
    ensureSheet(book, sheetName, SCHEMA[sheetName]);
  });

  applyValidation(book);
  seedSampleData();
  removeDefaultSheet(book);

  Logger.log('✅ Setup complete. Spreadsheet: ' + book.getUrl());
  return 'Setup complete: ' + Object.keys(SCHEMA).length + ' sheets ready.';
}

/** Create a sheet with headers if it doesn't exist; top-up headers if it does. */
function ensureSheet(book, name, headers) {
  var sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2a44').setFontColor('#ffffff');
    sh.autoResizeColumns(1, headers.length);
  }
  return sh;
}

/** Attach dropdown (data validation) lists to the enum columns. */
function applyValidation(book) {
  addDropdown(book, SHEETS.CAMPAIGNS, 'status', ENUMS.campaignStatus);
  addDropdown(book, SHEETS.TASKS, 'status', ENUMS.taskStatus);
  addDropdown(book, SHEETS.TASKS, 'completionMode', ENUMS.completionMode);
  addDropdown(book, SHEETS.QR_CODES, 'status', ENUMS.qrStatus);
  addDropdown(book, SHEETS.QR_CODES, 'progress', ENUMS.progress);
  // Phase 2 columns
  addDropdown(book, SHEETS.REWARDS, 'type', ENUMS.rewardType);
  addDropdown(book, SHEETS.REWARDS, 'status', ENUMS.rewardStatus);
  addDropdown(book, SHEETS.CERTIFICATES, 'scope', ENUMS.certScope);
  addDropdown(book, SHEETS.CERTIFICATES, 'status', ENUMS.certStatus);
}

function addDropdown(book, sheetName, colName, values) {
  var sh = book.getSheetByName(sheetName);
  if (!sh) return;
  var headers = SCHEMA[sheetName];
  var col = headers.indexOf(colName) + 1;
  if (col === 0) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).build();
  sh.getRange(2, col, 1000, 1).setDataValidation(rule);
}

/** Seed sample rows ONLY if the sheet currently has no data rows. */
function seedSampleData() {
  if (readAll(SHEETS.USERS).length === 0) {
    appendRow(SHEETS.USERS, {
      userId: 'U001', name: 'Admin Teacher', email: 'admin@school.edu',
      role: 'admin', pinHash: hashPin('1234'), status: 'Active', createdAt: nowIso(),
    });
  }

  if (readAll(SHEETS.CAMPAIGNS).length === 0) {
    appendRow(SHEETS.CAMPAIGNS, {
      campaignId: 'CAMP001', name: 'English Week 2026',
      description: 'School-wide English activities', subject: 'English',
      program: 'Literacy', startDate: '2026-06-01', endDate: '2026-06-30',
      status: 'Active', teacherInCharge: 'Admin Teacher', notes: '', createdAt: nowIso(),
    });
  }

  if (readAll(SHEETS.TASKS).length === 0) {
    appendRow(SHEETS.TASKS, {
      taskId: 'TASK001', campaignId: 'CAMP001',
      title: 'Reading Comprehension Exercise',
      description: 'Read the passage and answer the questions.',
      subject: 'English', teacherName: 'Admin Teacher',
      dueDate: '2026-06-15', category: 'Worksheet',
      masterLink: 'https://forms.gle/example-reading-task',
      completionMode: 'auto', pointsValue: 10,
      status: 'Active', createdAt: nowIso(), updatedAt: nowIso(),
    });
  }

  if (readAll(SHEETS.STUDENTS).length === 0) {
    var sampleStudents = [
      { id: 'STU001', name: 'Ahmad bin Ali', cls: '3 Cerdik' },
      { id: 'STU002', name: 'Siti Nurhaliza', cls: '3 Cerdik' },
      { id: 'STU003', name: 'Raj Kumar', cls: '3 Cerdik' },
      { id: 'STU004', name: 'Mei Ling', cls: '3 Bijak' },
      { id: 'STU005', name: 'John Doe', cls: '3 Bijak' },
    ];
    appendRows(SHEETS.STUDENTS, sampleStudents.map(function (s) {
      return {
        studentId: s.id, name: s.name, className: s.cls,
        groupId: '', gender: '', notes: '', createdAt: nowIso(),
      };
    }));

    // Auto-generate a QR code for each sample student (the "split" in action).
    var qrs = sampleStudents.map(function (s) {
      return {
        token: makeToken('TASK001', s.id),
        taskId: 'TASK001', entityType: 'student', entityId: s.id,
        label: s.name, className: s.cls,
        status: 'Active', progress: 'Not Started',
        firstScan: '', lastScan: '', scanCount: 0,
        completedAt: '', points: 0, remarks: '', createdAt: nowIso(),
      };
    });
    appendRows(SHEETS.QR_CODES, qrs);
  }

  // ---- Phase 2 seeds ----------------------------------------------------
  // A handful of starter badges. The `criteria` text is read by checkBadges().
  if (readAll(SHEETS.BADGES).length === 0) {
    appendRows(SHEETS.BADGES, [
      { badgeId: 'B001', name: 'First Steps',       description: 'Scanned your very first task.',     icon: '🌟', criteria: 'first_scan',       createdAt: nowIso() },
      { badgeId: 'B002', name: 'Getting Going',     description: 'Completed 3 tasks.',                icon: '🏅', criteria: 'tasks:3',          createdAt: nowIso() },
      { badgeId: 'B003', name: 'High Five',         description: 'Completed 5 tasks.',                icon: '🎖️', criteria: 'tasks:5',          createdAt: nowIso() },
      { badgeId: 'B004', name: 'Century Club',      description: 'Earned 100 points.',               icon: '💯', criteria: 'points:100',       createdAt: nowIso() },
      { badgeId: 'B005', name: 'Campaign Champion', description: 'Finished every task in a campaign.', icon: '👑', criteria: 'perfect_campaign', createdAt: nowIso() },
    ]);
  }

  // A few sample rewards pupils can redeem with points (only shown if gamification is ON).
  if (readAll(SHEETS.REWARDS).length === 0) {
    appendRows(SHEETS.REWARDS, [
      { rewardId: 'R001', name: 'Homework Pass', description: 'Skip one homework.',               cost: 100, type: 'privilege',   status: 'Active', createdAt: nowIso() },
      { rewardId: 'R002', name: 'Class Helper',  description: "Be the teacher's helper for a day.", cost: 60,  type: 'recognition', status: 'Active', createdAt: nowIso() },
      { rewardId: 'R003', name: 'Sticker Pack',  description: 'A pack of fun stickers.',          cost: 40,  type: 'item',       status: 'Active', createdAt: nowIso() },
    ]);
  }

  // Default settings row (school name, theme).
  if (readAll(SHEETS.SETTINGS).length === 0) {
    appendRows(SHEETS.SETTINGS, [
      { key: 'schoolName', value: 'My School', updatedAt: nowIso() },
      { key: 'gamificationEnabled', value: 'false', updatedAt: nowIso() },
      { key: 'theme', value: 'light', updatedAt: nowIso() },
    ]);
  }
}

/** Remove the default empty "Sheet1" Google adds to new spreadsheets. */
function removeDefaultSheet(book) {
  var def = book.getSheetByName('Sheet1');
  if (def && book.getSheets().length > 1) book.deleteSheet(def);
}

/**
 * DANGER: deletes every data row in every sheet (keeps headers) and reseeds.
 * Use only while testing.
 */
function resetDatabase() {
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = getBook().getSheetByName(name);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    }
  });
  seedSampleData();
  CacheService.getScriptCache().removeAll(['dashboard']);
  return 'Database reset and reseeded.';
}

/**
 * OPTIONAL lively demo data — run this ONCE after setupDatabase() for a great
 * preview. It fills the dashboard charts, leaderboard, badges and certificates
 * with realistic sample activity so every screen looks alive, without anyone
 * needing to scan a real QR code.
 *
 * Safe & opt-in: runs only once (guarded by a 'demoSeeded' setting) and never
 * deletes anything. To start completely fresh again, run resetDatabase().
 */
function seedDemoData() {
  if (String((getSettings() || {}).demoSeeded) === 'true') {
    return 'Demo data is already loaded. Run resetDatabase() to start over.';
  }

  // Helper: an ISO timestamp `d` days ago, at the given hour.
  function ago(d, hour) {
    var x = new Date(); x.setDate(x.getDate() - d);
    x.setHours(hour == null ? 9 : hour, 12, 0, 0);
    return x.toISOString();
  }

  // Map each sample pupil to their TASK001 QR token (created by setupDatabase).
  var tok = {};
  findWhere(SHEETS.QR_CODES, 'taskId', 'TASK001').forEach(function (q) { tok[q.entityId] = q.token; });

  // 1) Bring those QR codes to life: scanned / in-progress / completed.
  var qrUpdates = {
    STU001: { progress: 'Completed',  scanCount: 4, points: 10, firstScan: ago(5, 8),  lastScan: ago(0, 9),  completedAt: ago(0, 9) },
    STU002: { progress: 'Completed',  scanCount: 3, points: 10, firstScan: ago(4, 10), lastScan: ago(1, 11), completedAt: ago(1, 11) },
    STU003: { progress: 'In Progress', scanCount: 2, points: 0, firstScan: ago(3, 12), lastScan: ago(0, 13) },
    STU004: { progress: 'Opened',      scanCount: 1, points: 0, firstScan: ago(2, 14), lastScan: ago(2, 14) },
  };
  Object.keys(qrUpdates).forEach(function (sid) {
    if (tok[sid]) updateWhere(SHEETS.QR_CODES, 'token', tok[sid], qrUpdates[sid]);
  });

  // 2) Scan history (drives the daily + peak-hour charts and "scans today").
  var plan = [
    ['STU001', 5, 8], ['STU001', 2, 9], ['STU001', 0, 9],
    ['STU002', 4, 10], ['STU002', 1, 11],
    ['STU003', 3, 12], ['STU003', 0, 13],
    ['STU004', 2, 14], ['STU001', 0, 10], ['STU002', 0, 11],
  ];
  var devices = ['mobile', 'mobile', 'tablet', 'desktop'];
  appendRows(SHEETS.SCAN_LOGS, plan.map(function (p, i) {
    return {
      logId: uid('SCAN'), token: tok[p[0]] || '', taskId: 'TASK001', entityId: p[0],
      timestamp: ago(p[1], p[2]), deviceType: devices[i % devices.length],
      userAgent: 'demo', action: 'scan',
    };
  }));

  // 3) Completion records for the two finished pupils.
  appendRows(SHEETS.COMPLETION_LOGS, [
    { logId: uid('COMP'), token: tok.STU001 || '', taskId: 'TASK001', entityId: 'STU001', method: 'auto',   status: 'Completed', durationSec: 320, evidence: '', reviewedBy: 'Admin Teacher', notes: '',           timestamp: ago(0, 9) },
    { logId: uid('COMP'), token: tok.STU002 || '', taskId: 'TASK001', entityId: 'STU002', method: 'manual', status: 'Completed', durationSec: 410, evidence: '', reviewedBy: 'Admin Teacher', notes: 'Great work', timestamp: ago(1, 11) },
  ]);

  // 4) Points ledger (drives the gamified leaderboard balances).
  appendRows(SHEETS.POINTS_LOG, [
    { logId: uid('PT'), entityId: 'STU001', taskId: 'TASK001', points: 10, reason: 'task:TASK001',            timestamp: ago(0, 9) },
    { logId: uid('PT'), entityId: 'STU001', taskId: '',        points: 5,  reason: 'Bonus: excellent effort', timestamp: ago(0, 9) },
    { logId: uid('PT'), entityId: 'STU002', taskId: 'TASK001', points: 10, reason: 'task:TASK001',            timestamp: ago(1, 11) },
    { logId: uid('PT'), entityId: 'STU003', taskId: '',        points: 5,  reason: 'Participation',           timestamp: ago(0, 13) },
  ]);

  // 5) Earned badges (First Steps = scanned at least once).
  appendRows(SHEETS.STUDENT_BADGES, ['STU001', 'STU002', 'STU003', 'STU004'].map(function (sid) {
    return { logId: uid('BDG'), entityId: sid, badgeId: 'B001', reason: 'Auto: first_scan', awardedAt: ago(3, 9) };
  }));

  // 6) A second campaign so the Campaigns list shows more than one.
  if (!findOne(SHEETS.CAMPAIGNS, 'campaignId', 'CAMP002')) {
    appendRow(SHEETS.CAMPAIGNS, {
      campaignId: 'CAMP002', name: 'Science Fair 2026', description: 'Whole-school science projects.',
      subject: 'Science', program: 'STEM', startDate: ago(-1, 9).slice(0, 10), endDate: ago(-30, 9).slice(0, 10),
      status: 'Draft', teacherInCharge: 'Admin Teacher', notes: '', createdAt: nowIso(),
    });
  }

  // 7) A sample certificate for the top pupil (campaign award).
  issueCertificate({ entityId: 'STU001', scope: 'campaign', scopeId: 'CAMP001', issuedBy: 'Admin Teacher' });

  saveSetting('demoSeeded', 'true');
  invalidateDashboard();
  return 'Demo data loaded: scans, completions, points, badges and a certificate. Refresh the app to see it.';
}



/* ==========================================================================
 * FILE 9/9  -  Code.gs
 * ======================================================================== */
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

  // A2) CERTIFICATE VERIFY: a certificate QR was opened. p.cert is the token.
  if (p.cert) {
    return verifyPage(verifyCertificate(p.cert));
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

    // ---- Phase 2 reads ----
    case 'getCampaign':      requireRole(p.token, CONFIG.ROLES); return getCampaign(p.campaignId);
    case 'leaderboard':      requireRole(p.token, CONFIG.ROLES); return getLeaderboard(p.className);
    case 'listBadges':       requireRole(p.token, CONFIG.ROLES); return listBadges();
    case 'getStudentBadges': requireRole(p.token, CONFIG.ROLES); return getStudentBadges(p.entityId);
    case 'getStudentPoints': requireRole(p.token, CONFIG.ROLES); return { entityId: p.entityId, points: getStudentPoints(p.entityId) };
    case 'listRewards':      requireRole(p.token, CONFIG.ROLES); return listRewards();
    case 'listCertificates': requireRole(p.token, CONFIG.ROLES); return listCertificates(p.scopeId);
    case 'getCertificate':   requireRole(p.token, CONFIG.ROLES); return getCertificate(p.certToken);

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

    // ---- Phase 2 writes ----
    case 'saveBadge':         requireRole(b.token, WRITERS); return saveBadge(b);
    case 'awardPoints':       requireRole(b.token, WRITERS); return awardPoints(b.entityId, b.taskId, Number(b.points), b.reason || 'Manual award');
    case 'saveReward':        requireRole(b.token, WRITERS); return saveReward(b);
    case 'redeemReward':      requireRole(b.token, WRITERS); return redeemReward(b);
    case 'issueCertificate':  requireRole(b.token, WRITERS); return issueCertificate(b);
    case 'revokeCertificate': requireRole(b.token, WRITERS); return revokeCertificate(b.certToken);

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
