// ============================================================
// SHEET UTILITIES
// ============================================================

function getRotationSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ROTATION);
}

function getEngineersSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ENGINEERS);
}

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CONFIG);
}

function getArchiveSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ARCHIVE);
}

function createArchiveSheetIfNeeded() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEETS.ARCHIVE)) {
    return;
  }

  const archiveSheet = ss.insertSheet(SHEETS.ARCHIVE);
  archiveSheet.getRange(1, 1, 1, 6).setValues([
    ["Start Date", "End Date", "Backend Engineer", "Frontend Engineer",
     "Completed Date", "Notes"]
  ]);
}

function clearRotationSchedule() {
  const rotationSheet = getRotationSheet();
  rotationSheet.getRange(2, 1, rotationSheet.getMaxRows() - 1, 6).clearContent();
}

function writeAssignmentToSheet(sheet, rowNum, assignment) {
  sheet.getRange(rowNum, 1, 1, 6).setValues([[
    assignment.startDate,
    assignment.endDate,
    assignment.backend,
    assignment.frontend,
    "FALSE",
    "FALSE"
  ]]);
}

function findFirstEmptyRow(sheet) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (!data[i][ROTATION_COLS.START_DATE]) {
      return i + 1;
    }
  }
  return data.length + 1;
}

function markAssignmentAsNotified(rowIndex) {
  getRotationSheet().getRange(rowIndex, ROTATION_COLS.NOTIFIED + 1).setValue("TRUE");
}

function markAssignmentReminderAsSent(rowIndex) {
  getRotationSheet().getRange(rowIndex, ROTATION_COLS.REMINDER_SENT + 1).setValue("TRUE");
}

function isFlagSet(value) {
  return value === true || String(value).trim().toUpperCase() === "TRUE";
}

function withScriptLock(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return action();
  } finally {
    lock.releaseLock();
  }
}
