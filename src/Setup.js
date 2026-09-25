// ============================================================
// SLACK TOKEN (stored in Script Properties)
// ============================================================

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
