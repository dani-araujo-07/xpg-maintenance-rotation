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

const LEGACY_INDEX_KEYS = {
  [PROPERTY_KEYS.LAST_BACKEND_INDEX]: "Last Backend Index",
  [PROPERTY_KEYS.LAST_FRONTEND_INDEX]: "Last Frontend Index"
};

function getRotationIndex(propertyKey) {
  const stored = PropertiesService.getScriptProperties().getProperty(propertyKey);
  if (stored !== null) return Number(stored);

  const legacy = readConfigSheetValues()[LEGACY_INDEX_KEYS[propertyKey]];
  return isBlank(legacy) ? 0 : Number(legacy);
}

function setRotationIndex(propertyKey, index) {
  PropertiesService.getScriptProperties().setProperty(propertyKey, String(index));
}

function migrateLegacyRotationIndices(configValues) {
  const properties = PropertiesService.getScriptProperties();
  for (const propertyKey of Object.keys(LEGACY_INDEX_KEYS)) {
    const legacy = configValues[LEGACY_INDEX_KEYS[propertyKey]];
    if (properties.getProperty(propertyKey) === null && !isBlank(legacy)) {
      properties.setProperty(propertyKey, String(Number(legacy)));
      Logger.log(`✓ Moved "${LEGACY_INDEX_KEYS[propertyKey]}" (${legacy}) to Script Properties`);
    }
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

  const lastBackendIndex = getRotationIndex(PROPERTY_KEYS.LAST_BACKEND_INDEX);
  const lastFrontendIndex = getRotationIndex(PROPERTY_KEYS.LAST_FRONTEND_INDEX);
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
  withScriptLock(archiveAndTopUpSchedule);
}

function archiveAndTopUpSchedule() {
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

  const maxFutureAssignments = getConfig().MAX_FUTURE_ASSIGNMENTS;
  if (futureCount < maxFutureAssignments) {
    const needed = maxFutureAssignments - futureCount;
    generateFutureAssignments(needed);
    Logger.log(`✓ Archived ${archivedCount}, generated ${needed} new assignments`);
  } else {
    Logger.log(`✓ Archived ${archivedCount} past assignments`);
  }
}

// ============================================================
// ASSIGNMENT LOGIC
// ============================================================

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

  const firstRotationDate = getConfig().FIRST_ROTATION_DATE;
  if (!firstRotationDate) {
    throw new Error("Schedule and archive are empty - set FIRST_ROTATION_DATE in the Config sheet");
  }
  return DateUtils.subtractDays(firstRotationDate, 1);
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
  const days = getConfig().DAYS_IN_MAINTENANCE;

  const periodStart = new Date(lastEndDate);
  periodStart.setDate(periodStart.getDate() + 1);
  periodStart.setDate(periodStart.getDate() + (offsetWeeks * days));

  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + (days - 1));

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
    setRotationIndex(PROPERTY_KEYS.LAST_BACKEND_INDEX, backendIndex);
  } else {
    Logger.log(`⚠️ Archived backend engineer "${rowData[ROTATION_COLS.BACKEND]}" not found in Engineers sheet - rotation index not advanced`);
  }

  if (frontendIndex >= 0) {
    setRotationIndex(PROPERTY_KEYS.LAST_FRONTEND_INDEX, frontendIndex);
  } else {
    Logger.log(`⚠️ Archived frontend engineer "${rowData[ROTATION_COLS.FRONTEND]}" not found in Engineers sheet - rotation index not advanced`);
  }
}
