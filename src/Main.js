// ============================================================
// MAINTENANCE ROTATION & SLACK NOTIFICATION SYSTEM
// ============================================================

const CONFIG = {
  // ============================================================
  // SHEET CONFIGURATION
  // ============================================================
  ENGINEERS_SHEET: "Engineers",
  ROTATION_SHEET: "Rotation Schedule",
  CONFIG_SHEET: "Config",
  ARCHIVE_SHEET: "Archive",

  // ============================================================
  // TIMING CONFIGURATION
  // ============================================================
  TIMEZONE: "Europe/Berlin",
  DAYS_IN_MAINTENANCE: 14,
  MAX_FUTURE_ASSIGNMENTS: 12,
  ROTATION_START_DATE: "2026-09-06",   // treated as the END of the period before the first one

  // ============================================================
  // MAINTENANCE ROTATION SCHEDULE
  // ============================================================
  MAINTENANCE_ROTATION_DAY: 1,         // Day to rotate (0=Sunday, 1=Monday, 2=Tuesday, etc.)
  MAINTENANCE_START_HOUR: 15,          // Hour maintenance starts (3pm)
  MAINTENANCE_ARCHIVE_HOUR: 1,         // Hour to archive past rotations (1am same day)

  REMINDER_DAY: 4,                     // Day to send reminders (0=Sunday, ..., 4=Thursday, 5=Friday)
  REMINDER_HOUR: 15,                   // Hour to send reminders (3pm)

  // ============================================================
  // SLACK CONFIGURATION
  // ============================================================
  SLACK_CHANNEL_NOTIFICATIONS: "product-xpg-publishing-ops-team",
  BUGS_CHANNEL_ID: "C0C1NMYJFGW",

  // ============================================================
  // MESSAGE TEMPLATES
  // ============================================================
  MESSAGES: {
    HANDOVER_HEADER: "🔄 Maintenance Rotation Handover",
    HANDOVER_DESCRIPTION: "Please coordinate a handover in both directions:",
    HANDOVER_OUTGOING: "• Outgoing → incoming: in-progress maintenance tasks",
    HANDOVER_INCOMING: "• Incoming → outgoing: project tasks without an open PR (work still remains on them)",
    HANDOVER_NEXT_STEPS: "Once handed over, incoming folks can start on maintenance tasks marked \"Ready for Development\" and should keep an eye on <#{BUGS_CHANNEL_ID}> for urgent incoming issues.",
    HANDOVER_NOTE: "🔗 *Note:* The frontend engineer on rotation also covers the responsibilities of the <https://app.notion.com/p/storyblok/Frontend-Engineering-Hub-a88d0ecc03c541b39ed87ce4539382a2?source=copy_link#34b84ab4f0f380bca6dbfe51a067bb3f|former Primary Interrupt role>.",

    CHANGES_HEADER: "🔧 Maintenance Rotation Changes on Monday",
    CHANGES_PREPARE: "Prepare your task handover before Monday at {TIME}",
    CHANGES_CHECK: "Please check your calendars for PTO and coordinate coverage if needed."
  },

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  getMaintenanceStartTimeDisplay(date) {
    const ref = date || new Date();
    const tz = Utilities.formatDate(ref, this.TIMEZONE, "z");
    return `${this.MAINTENANCE_START_HOUR}:00 ${tz}`;
  },

  getDurationText() {
    return this.DAYS_IN_MAINTENANCE === 14 ? "2 weeks" : `${this.DAYS_IN_MAINTENANCE} days`;
  },

  getDayName(dayNumber) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[dayNumber] || "Unknown";
  }
};

// ============================================================
// COLUMN INDICES (zero-based; add 1 for getRange)
// ============================================================

const ROTATION_COLS = {
  START_DATE: 0,
  END_DATE: 1,
  BACKEND: 2,
  FRONTEND: 3,
  NOTIFIED: 4,
  REMINDER_SENT: 5
};

const ARCHIVE_COLS = {
  START_DATE: 0,
  END_DATE: 1,
  BACKEND: 2,
  FRONTEND: 3,
  COMPLETED_DATE: 4,
  NOTES: 5
};

// ============================================================
// INITIALIZATION & SETUP
// ============================================================

function createSheets() {
  Logger.log("Creating sheets...");

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName(CONFIG.ENGINEERS_SHEET)) {
    const engineersSheet = ss.insertSheet(CONFIG.ENGINEERS_SHEET);
    engineersSheet.getRange(1, 1, 1, 3).setValues([
      ["Name", "Area", "Slack User ID"]
    ]);
    Logger.log("✓ Engineers sheet created");
  }

  if (!ss.getSheetByName(CONFIG.ROTATION_SHEET)) {
    const rotationSheet = ss.insertSheet(CONFIG.ROTATION_SHEET);
    rotationSheet.getRange(1, 1, 1, 6).setValues([
      ["Start Date", "End Date", "Backend Engineer", "Frontend Engineer",
       "Handover Notification Sent", "Reminder Sent"]
    ]);
    Logger.log("✓ Rotation Schedule sheet created");
  }

  if (!ss.getSheetByName(CONFIG.CONFIG_SHEET)) {
    const configSheet = ss.insertSheet(CONFIG.CONFIG_SHEET);
    configSheet.getRange(1, 1, 1, 2).setValues([
      ["Setting", "Value"]
    ]);
    Logger.log("✓ Config sheet created");
  }

  if (!ss.getSheetByName(CONFIG.ARCHIVE_SHEET)) {
    const archiveSheet = ss.insertSheet(CONFIG.ARCHIVE_SHEET);
    archiveSheet.getRange(1, 1, 1, 6).setValues([
      ["Start Date", "End Date", "Backend Engineer", "Frontend Engineer",
       "Completed Date", "Notes"]
    ]);
    Logger.log("✓ Archive sheet created");
  }

  Logger.log("\n✓ All sheets created!");
  Logger.log("\nNext steps:");
  Logger.log("1. Go to Engineers sheet and add your team (Name + Area + Slack User ID)");
  Logger.log("2. Run setSlackToken('your-token-here') to add your Slack Bot Token");
  Logger.log("3. Run initializeRotation() to generate 12 rotations");
}

function init() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     INITIALIZING SYSTEM                ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  createSheets();
  Logger.log("");

  Logger.log("Setting up rotation system...");
  initializeRotation();
  Logger.log("✓ First 12 rotations created!");
  Logger.log("");

  Logger.log("Scheduling triggers...");
  setupTriggers();
  Logger.log("");

  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     SYSTEM READY!                      ║");
  Logger.log("╚════════════════════════════════════════╝");
}

function initializeRotation() {
  createArchiveSheetIfNeeded();
  initializeStateTracking();
  clearRotationSchedule();
  generateFutureAssignments(CONFIG.MAX_FUTURE_ASSIGNMENTS);
  Logger.log("✓ Rotation system initialized");
}

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

function getSlackToken() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty("SLACK_BOT_TOKEN");

  if (!token) {
    Logger.log("Warning: Slack Bot Token not found in Script Properties");
    Logger.log("Run: setSlackToken('your-token-here')");
  }

  return token;
}

function setSlackToken(token) {
  if (!token) {
    Logger.log("Error: Token cannot be empty");
    return;
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty("SLACK_BOT_TOKEN", token);

  Logger.log("✓ Slack token saved to Script Properties");
  Logger.log("Testing connection...");

  if (SlackAPI.testConnection(token)) {
    Logger.log("✓ Token verified and working!");
  } else {
    Logger.log("✗ Token test failed - please check if it's correct");
  }
}

function clearSlackToken() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty("SLACK_BOT_TOKEN");
  Logger.log("✓ Slack token cleared");
}

function getSlackChannel() {
  return CONFIG.SLACK_CHANNEL_NOTIFICATIONS;
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

  let rowNum = findFirstEmptyRow(rotationSheet);

  for (let i = 0; i < count; i++) {
    const backendIndex = (lastBackendIndex + i) % engineers.backend.length;
    const frontendIndex = (lastFrontendIndex + i) % engineers.frontend.length;

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

  for (let i = data.length - 1; i > 0; i--) {
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

function getLastAssignmentEndDate() {
  const rotationSheet = getRotationSheet();
  const data = rotationSheet.getDataRange().getValues();

  let lastEndDate = new Date(CONFIG.ROTATION_START_DATE);

  if (data.length > 1) {
    for (let i = data.length - 1; i > 0; i--) {
      if (data[i][ROTATION_COLS.END_DATE]) {
        lastEndDate = new Date(data[i][ROTATION_COLS.END_DATE]);
        break;
      }
    }
  }

  return lastEndDate;
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

// ============================================================
// ROTATION DAY NOTIFICATIONS
// ============================================================

function sendMaintenanceHandoverNotification() {
  const today = DateUtils.getTodayAtMidnight();
  const newAssignment = findAssignmentByStartDate(today);

  if (!newAssignment) {
    Logger.log("No assignment found for today");
    return;
  }

  if (newAssignment.notified === "TRUE") {
    Logger.log("Notification already sent for today");
    return;
  }

  const yesterday = DateUtils.subtractDays(today, 1);
  const previousAssignment = findPreviousAssignment(yesterday);

  notifyHandover(newAssignment, previousAssignment);
  markAssignmentAsNotified(newAssignment.rowIndex);
}

function notifyHandover(newAssignment, previousAssignment) {
  const slackToken = getSlackToken();
  const slackChannel = getSlackChannel();

  if (!slackToken || !slackChannel) {
    Logger.log("Slack configuration not found");
    return;
  }

  if (!previousAssignment) {
    Logger.log("No previous assignment found - skipping handover notification");
    return;
  }

  const engineers = getEngineersData();

  const newBackendId = engineers.userIds[newAssignment.backend] || newAssignment.backend;
  const newFrontendId = engineers.userIds[newAssignment.frontend] || newAssignment.frontend;
  const prevBackendId = engineers.userIds[previousAssignment.backend] || previousAssignment.backend;
  const prevFrontendId = engineers.userIds[previousAssignment.frontend] || previousAssignment.frontend;

  const message = buildHandoverMessage(
    prevBackendId, newBackendId,
    prevFrontendId, newFrontendId,
    newAssignment
  );

  SlackAPI.sendMessage(slackToken, slackChannel, message);
  Logger.log(`✓ Sent handover notification`);
}

// ============================================================
// REMINDER NOTIFICATIONS
// ============================================================

function sendReminderNotification() {
  const today = DateUtils.getTodayAtMidnight();

  if (today.getDay() !== CONFIG.REMINDER_DAY) {
    Logger.log(`Today is not ${CONFIG.getDayName(CONFIG.REMINDER_DAY)}, skipping notification`);
    return;
  }

  const slackToken = getSlackToken();
  const slackChannel = getSlackChannel();

  if (!slackToken || !slackChannel) {
    Logger.log("Slack configuration not found");
    return;
  }

  const daysUntilRotation = (CONFIG.MAINTENANCE_ROTATION_DAY - today.getDay() + 7) % 7;
  const nextRotationDay = DateUtils.addDays(today, daysUntilRotation);

  const assignment = findAssignmentByStartDate(nextRotationDay);

  if (!assignment) {
    Logger.log(`No assignment found for next ${CONFIG.getDayName(CONFIG.MAINTENANCE_ROTATION_DAY)}`);
    return;
  }

  if (assignment.reminderSent === "TRUE") {
    Logger.log("Reminder already sent for this rotation");
    return;
  }

  const prevAssignment = findPreviousAssignment(DateUtils.subtractDays(nextRotationDay, 1));

  if (!prevAssignment) {
    Logger.log("No previous assignment found - skipping reminder");
    return;
  }

  const engineers = getEngineersData();

  const backendId = engineers.userIds[assignment.backend] || assignment.backend;
  const frontendId = engineers.userIds[assignment.frontend] || assignment.frontend;
  const prevBackendId = engineers.userIds[prevAssignment.backend] || prevAssignment.backend;
  const prevFrontendId = engineers.userIds[prevAssignment.frontend] || prevAssignment.frontend;

  const message = buildChangeNotificationMessage(
    prevBackendId, backendId,
    prevFrontendId, frontendId,
    nextRotationDay
  );

  SlackAPI.sendMessage(slackToken, slackChannel, message);
  markAssignmentReminderAsSent(assignment.rowIndex);
  Logger.log(`✓ Sent change notification for next rotation`);
}

// ============================================================
// MESSAGE BUILDERS
// ============================================================

function formatHandoverMoment(date) {
  const d = new Date(date);
  d.setHours(CONFIG.MAINTENANCE_START_HOUR, 0, 0, 0);
  const datePart = Utilities.formatDate(d, CONFIG.TIMEZONE, "EEE, MMM d, yyyy");
  const tz = Utilities.formatDate(d, CONFIG.TIMEZONE, "z");
  return `${datePart}, ${CONFIG.MAINTENANCE_START_HOUR}:00 ${tz}`;
}

function buildHandoverMessage(prevBackendId, newBackendId, prevFrontendId, newFrontendId, newAssignment) {
  const handoverStart = formatHandoverMoment(newAssignment.startDate);
  const handoverEnd = formatHandoverMoment(DateUtils.addDays(new Date(newAssignment.endDate), 1));

  return {
    text: CONFIG.MESSAGES.HANDOVER_HEADER,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: CONFIG.MESSAGES.HANDOVER_HEADER, emoji: true }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *Backend:* <@${prevBackendId}> → <@${newBackendId}>\n• *Frontend:* <@${prevFrontendId}> → <@${newFrontendId}>`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:calendar: *Maintenance Period:* ${CONFIG.getDurationText()}\n${handoverStart}  →  ${handoverEnd}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${CONFIG.MESSAGES.HANDOVER_DESCRIPTION}\n${CONFIG.MESSAGES.HANDOVER_OUTGOING}\n${CONFIG.MESSAGES.HANDOVER_INCOMING}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: CONFIG.MESSAGES.HANDOVER_NEXT_STEPS.replace("{BUGS_CHANNEL_ID}", CONFIG.BUGS_CHANNEL_ID)
        }
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: CONFIG.MESSAGES.HANDOVER_NOTE }
        ]
      }
    ]
  };
}

function buildChangeNotificationMessage(prevBackendId, newBackendId, prevFrontendId, newFrontendId, rotationDate) {
  const prepareMsg = CONFIG.MESSAGES.CHANGES_PREPARE.replace(
    "{TIME}",
    CONFIG.getMaintenanceStartTimeDisplay(rotationDate)
  );

  return {
    text: CONFIG.MESSAGES.CHANGES_HEADER,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: CONFIG.MESSAGES.CHANGES_HEADER }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *Backend:* <@${prevBackendId}> → <@${newBackendId}>\n• *Frontend:* <@${prevFrontendId}> → <@${newFrontendId}>`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:alarm_clock: ${prepareMsg}\n:calendar: ${CONFIG.MESSAGES.CHANGES_CHECK}`
        }
      }
    ]
  };
}

// ============================================================
// SETUP TRIGGERS
// ============================================================

function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }

  const weekDays = [
    ScriptApp.WeekDay.SUNDAY,
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY,
    ScriptApp.WeekDay.SATURDAY
  ];

  ScriptApp.newTrigger("maintainRotation")
    .timeBased()
    .onWeekDay(weekDays[CONFIG.MAINTENANCE_ROTATION_DAY])
    .atHour(CONFIG.MAINTENANCE_ARCHIVE_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  ScriptApp.newTrigger("sendMaintenanceHandoverNotification")
    .timeBased()
    .onWeekDay(weekDays[CONFIG.MAINTENANCE_ROTATION_DAY])
    .atHour(CONFIG.MAINTENANCE_START_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  ScriptApp.newTrigger("sendReminderNotification")
    .timeBased()
    .onWeekDay(weekDays[CONFIG.REMINDER_DAY])
    .atHour(CONFIG.REMINDER_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log(`✓ Triggers set up`);
  Logger.log(`  - Maintenance handover: ${CONFIG.getDayName(CONFIG.MAINTENANCE_ROTATION_DAY)} at ${CONFIG.MAINTENANCE_START_HOUR}:00`);
  Logger.log(`  - Change notification: ${CONFIG.getDayName(CONFIG.REMINDER_DAY)} at ${CONFIG.REMINDER_HOUR}:00`);
}