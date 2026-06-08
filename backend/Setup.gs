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
