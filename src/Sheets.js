// ============================================================
// SHEET UTILITIES
// ============================================================

function getRotationSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ROTATION_SHEET);
}

function getEngineersSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ENGINEERS_SHEET);
}

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.CONFIG_SHEET);
}

function getArchiveSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ARCHIVE_SHEET);
}

function createArchiveSheetIfNeeded() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(CONFIG.ARCHIVE_SHEET)) {
    return;
  }

  const archiveSheet = ss.insertSheet(CONFIG.ARCHIVE_SHEET);
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
