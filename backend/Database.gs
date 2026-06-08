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
