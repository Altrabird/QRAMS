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
