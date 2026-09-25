// ============================================================
// DATA MANAGEMENT
// ============================================================

function getEngineersData() {
  const sheet = getEngineersSheet();
  const data = sheet.getDataRange().getValues();

  const backend = [];
  const frontend = [];
  const userIds = {};

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    const focus = data[i][1];
    const slackUserId = data[i][2];

    if (!name || !focus) continue;

    if (slackUserId) {
      userIds[name] = slackUserId;
    }

    if (focus.toString().toLowerCase().includes("backend")) {
      backend.push(name);
    } else if (focus.toString().toLowerCase().includes("frontend")) {
      frontend.push(name);
    }
  }

  return { backend, frontend, userIds };
}

function getStateValue(key) {
  const configSheet = getConfigSheet();
  const data = configSheet.getDataRange().getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1];
    }
  }

  return 0;
}

function setStateValue(key, value) {
  const configSheet = getConfigSheet();
  const data = configSheet.getDataRange().getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      configSheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }

  const newRow = data.length + 1;
  configSheet.getRange(newRow, 1).setValue(key);
  configSheet.getRange(newRow, 2).setValue(value);
}

function initializeStateTracking() {
  const configSheet = getConfigSheet();
  const data = configSheet.getDataRange().getValues();

  let hasBackendIndex = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === "Last Backend Index") {
      hasBackendIndex = true;
      break;
    }
  }

  if (!hasBackendIndex) {
    const rowStart = data.length + 1;
    configSheet.getRange(rowStart, 1, 2, 2).setValues([
      ["Last Backend Index", 0],
      ["Last Frontend Index", 0]
    ]);
  }
}

// ============================================================
// ROTATION GENERATION & MAINTENANCE
// ============================================================

function generateFutureAssignments(count) {
  const rotationSheet = getRotationSheet();
  const engineers = getEngineersData();

  if (!engineers.backend.length || !engineers.frontend.length) {
    Logger.log("✗ Cannot generate assignments: Engineers sheet has no backend and/or frontend entries");
    return;
  }

  const lastBackendIndex = getStateValue("Last Backend Index") || 0;
  const lastFrontendIndex = getStateValue("Last Frontend Index") || 0;
  const lastEndDate = getLastAssignmentEndDate();

  // The indices point at the last archived pair. The first scheduled row is the one after it,
  // and each row already in the schedule takes one more step - so new rows continue from there.
  // With an empty archive, the indices are 0 and the first scheduled row starts at 0.
  const offset = countScheduledAssignments() + (hasArchivedAssignments() ? 1 : 0);

  let rowNum = findFirstEmptyRow(rotationSheet);

  for (let i = 0; i < count; i++) {
    const backendIndex = (lastBackendIndex + offset + i) % engineers.backend.length;
    const frontendIndex = (lastFrontendIndex + offset + i) % engineers.frontend.length;

    const backendEng = engineers.backend[backendIndex];
    const frontendEng = engineers.frontend[frontendIndex];

    const { periodStart, periodEnd } = calculatePeriodDates(lastEndDate, i);

    writeAssignmentToSheet(rotationSheet, rowNum, {
      startDate: periodStart,
      endDate: periodEnd,
      backend: backendEng,
      frontend: frontendEng
    });

    rowNum++;
  }

  Logger.log(`✓ Generated ${count} future assignments`);
}

function maintainRotation() {
  const rotationSheet = getRotationSheet();
  const archiveSheet = getArchiveSheet();
  const data = rotationSheet.getDataRange().getValues();

  const today = DateUtils.getTodayAtMidnight();
  let archivedCount = 0;
  let rowsToDelete = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][ROTATION_COLS.END_DATE]) continue;

    const endDate = new Date(data[i][ROTATION_COLS.END_DATE]);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < today) {
      archiveAssignment(archiveSheet, data[i]);
      updateStateFromArchivedAssignment(data[i]);
      rowsToDelete.push(i + 1);
      archivedCount++;
    }
  }

  // Bottom-up, so deleting a row doesn't shift the ones still to delete
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    rotationSheet.deleteRow(rowsToDelete[i]);
  }

  const remainingData = rotationSheet.getDataRange().getValues();
  const futureCount = remainingData.length - 1;

  if (futureCount < CONFIG.MAX_FUTURE_ASSIGNMENTS) {
    const needed = CONFIG.MAX_FUTURE_ASSIGNMENTS - futureCount;
    generateFutureAssignments(needed);
    Logger.log(`✓ Archived ${archivedCount}, generated ${needed} new assignments`);
  } else {
    Logger.log(`✓ Archived ${archivedCount} past assignments`);
  }
}

// ============================================================
// ASSIGNMENT LOGIC
// ============================================================

// Continues from the schedule, then from the archive, and only falls back to
// ROTATION_START_DATE when both are empty (e.g. a brand-new sheet).
function getLastAssignmentEndDate() {
  const data = getRotationSheet().getDataRange().getValues();
  for (let i = data.length - 1; i > 0; i--) {
    if (data[i][ROTATION_COLS.END_DATE]) {
      return new Date(data[i][ROTATION_COLS.END_DATE]);
    }
  }

  const archive = getArchiveSheet().getDataRange().getValues();
  for (let i = archive.length - 1; i > 0; i--) {
    if (archive[i][ARCHIVE_COLS.END_DATE]) {
      return new Date(archive[i][ARCHIVE_COLS.END_DATE]);
    }
  }

  return new Date(CONFIG.ROTATION_START_DATE);
}

function countScheduledAssignments() {
  const data = getRotationSheet().getDataRange().getValues();
  return data.slice(1).filter(row => row[ROTATION_COLS.START_DATE]).length;
}

function hasArchivedAssignments() {
  const data = getArchiveSheet().getDataRange().getValues();
  return data.slice(1).some(row => row[ARCHIVE_COLS.END_DATE]);
}

function calculatePeriodDates(lastEndDate, offsetWeeks) {
  const periodStart = new Date(lastEndDate);
  periodStart.setDate(periodStart.getDate() + 1);
  periodStart.setDate(periodStart.getDate() + (offsetWeeks * CONFIG.DAYS_IN_MAINTENANCE));

  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + (CONFIG.DAYS_IN_MAINTENANCE - 1));

  return { periodStart, periodEnd };
}

function findAssignmentByStartDate(targetDate) {
  const rotationSheet = getRotationSheet();
  const data = rotationSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (!data[i][ROTATION_COLS.START_DATE]) continue;

    const startDate = new Date(data[i][ROTATION_COLS.START_DATE]);
    startDate.setHours(0, 0, 0, 0);

    if (startDate.getTime() === targetDate.getTime()) {
      return {
        rowIndex: i + 1,
        backend: data[i][ROTATION_COLS.BACKEND],
        frontend: data[i][ROTATION_COLS.FRONTEND],
        startDate: new Date(data[i][ROTATION_COLS.START_DATE]),
        endDate: new Date(data[i][ROTATION_COLS.END_DATE]),
        notified: data[i][ROTATION_COLS.NOTIFIED],
        reminderSent: data[i][ROTATION_COLS.REMINDER_SENT]
      };
    }
  }

  return null;
}

function findPreviousAssignment(targetDate) {
  const archiveSheet = getArchiveSheet();
  const data = archiveSheet.getDataRange().getValues();

  for (let i = data.length - 1; i > 0; i--) {
    if (!data[i][ARCHIVE_COLS.END_DATE]) continue;

    const endDate = new Date(data[i][ARCHIVE_COLS.END_DATE]);
    endDate.setHours(0, 0, 0, 0);

    if (endDate.getTime() === targetDate.getTime()) {
      return {
        backend: data[i][ARCHIVE_COLS.BACKEND],
        frontend: data[i][ARCHIVE_COLS.FRONTEND]
      };
    }
  }

  const rotationSheet = getRotationSheet();
  const rotationData = rotationSheet.getDataRange().getValues();

  for (let i = 1; i < rotationData.length; i++) {
    if (!rotationData[i][ROTATION_COLS.END_DATE]) continue;

    const endDate = new Date(rotationData[i][ROTATION_COLS.END_DATE]);
    endDate.setHours(0, 0, 0, 0);

    if (endDate.getTime() === targetDate.getTime()) {
      return {
        backend: rotationData[i][ROTATION_COLS.BACKEND],
        frontend: rotationData[i][ROTATION_COLS.FRONTEND]
      };
    }
  }

  return null;
}

function archiveAssignment(archiveSheet, rowData) {
  archiveSheet.appendRow([
    rowData[ROTATION_COLS.START_DATE],
    rowData[ROTATION_COLS.END_DATE],
    rowData[ROTATION_COLS.BACKEND],
    rowData[ROTATION_COLS.FRONTEND],
    new Date(),
    ""
  ]);
}

function updateStateFromArchivedAssignment(rowData) {
  const engineers = getEngineersData();
  const backendIndex = engineers.backend.indexOf(rowData[ROTATION_COLS.BACKEND]);
  const frontendIndex = engineers.frontend.indexOf(rowData[ROTATION_COLS.FRONTEND]);

  if (backendIndex >= 0) {
    setStateValue("Last Backend Index", backendIndex);
  } else {
    Logger.log(`⚠️ Archived backend engineer "${rowData[ROTATION_COLS.BACKEND]}" not found in Engineers sheet - rotation index not advanced`);
  }

  if (frontendIndex >= 0) {
    setStateValue("Last Frontend Index", frontendIndex);
  } else {
    Logger.log(`⚠️ Archived frontend engineer "${rowData[ROTATION_COLS.FRONTEND]}" not found in Engineers sheet - rotation index not advanced`);
  }
}
