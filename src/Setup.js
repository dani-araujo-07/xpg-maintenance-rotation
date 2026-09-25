// ============================================================
// SLACK TOKEN (stored in Script Properties)
// ============================================================

function getSlackToken() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty(PROPERTY_KEYS.SLACK_TOKEN);

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
  properties.setProperty(PROPERTY_KEYS.SLACK_TOKEN, token);

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
  properties.deleteProperty(PROPERTY_KEYS.SLACK_TOKEN);
  Logger.log("✓ Slack token cleared");
}

// ============================================================
// INITIALIZATION & SETUP
// ============================================================

function createSheets() {
  Logger.log("Creating sheets...");

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName(SHEETS.ENGINEERS)) {
    const engineersSheet = ss.insertSheet(SHEETS.ENGINEERS);
    engineersSheet.getRange(1, 1, 1, 3).setValues([
      ["Name", "Area", "Slack User ID"]
    ]);
    Logger.log("✓ Engineers sheet created");
  }

  if (!ss.getSheetByName(SHEETS.ROTATION)) {
    const rotationSheet = ss.insertSheet(SHEETS.ROTATION);
    rotationSheet.getRange(1, 1, 1, 6).setValues([
      ["Start Date", "End Date", "Backend Engineer", "Frontend Engineer",
       "Handover Notification Sent", "Reminder Sent"]
    ]);
    Logger.log("✓ Rotation Schedule sheet created");
  }

  if (!ss.getSheetByName(SHEETS.CONFIG)) {
    setupConfigSheet();
    Logger.log("✓ Config sheet created");
  }

  if (!ss.getSheetByName(SHEETS.ARCHIVE)) {
    const archiveSheet = ss.insertSheet(SHEETS.ARCHIVE);
    archiveSheet.getRange(1, 1, 1, 6).setValues([
      ["Start Date", "End Date", "Backend Engineer", "Frontend Engineer",
       "Completed Date", "Notes"]
    ]);
    Logger.log("✓ Archive sheet created");
  }

  Logger.log("\n✓ All sheets created!");
  Logger.log("\nNext steps:");
  Logger.log("1. Go to Engineers sheet and add your team (Name + Area + Slack User ID)");
  Logger.log("2. Fill in the Config sheet (at least SLACK_CHANNEL, BUGS_CHANNEL_ID and FIRST_ROTATION_DATE)");
  Logger.log("3. Run setSlackToken('your-token-here') to add your Slack Bot Token");
  Logger.log("4. Run initializeRotation() to generate the schedule");
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
  Logger.log(`✓ First ${getConfig().MAX_FUTURE_ASSIGNMENTS} rotations created!`);
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
  clearRotationSchedule();
  generateFutureAssignments(getConfig().MAX_FUTURE_ASSIGNMENTS);
  Logger.log("✓ Rotation system initialized");
}
