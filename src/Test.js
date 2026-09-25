function debugPreviousLookup() {
  const today = DateUtils.getTodayAtMidnight();
  const target = DateUtils.subtractDays(today, 1);
  Logger.log(`Today: ${today.toDateString()}`);
  Logger.log(`Looking for a period ending: ${target.toDateString()}`);
  Logger.log("");

  const arch = getArchiveSheet().getDataRange().getValues();
  Logger.log(`Archive rows: ${arch.length - 1}`);
  for (let i = 1; i < arch.length; i++) {
    const raw = arch[i][ARCHIVE_COLS.END_DATE];
    Logger.log(`  end=${raw} | type=${typeof raw} | parsed=${new Date(raw).toDateString()} | ${arch[i][ARCHIVE_COLS.BACKEND]} & ${arch[i][ARCHIVE_COLS.FRONTEND]}`);
  }
  Logger.log("");

  const rot = getRotationSheet().getDataRange().getValues();
  Logger.log(`Rotation rows: ${rot.length - 1}`);
  for (let i = 1; i < Math.min(4, rot.length); i++) {
    Logger.log(`  ${new Date(rot[i][ROTATION_COLS.START_DATE]).toDateString()} → ${new Date(rot[i][ROTATION_COLS.END_DATE]).toDateString()} | ${rot[i][ROTATION_COLS.BACKEND]} & ${rot[i][ROTATION_COLS.FRONTEND]}`);
  }
  Logger.log("");
  Logger.log(`Result: ${JSON.stringify(findPreviousAssignment(target))}`);
}

// ============================================================
// TESTING
// ============================================================

function setup() {
  Logger.log("Setting up rotation system...");
  initializeRotation();
  Logger.log("✓ First 12 rotations created!");

  // Show them
  const rotationData = getRotationSheet().getDataRange().getValues();
  Logger.log(`\nCreated ${rotationData.length - 1} assignments:`);
  for (let i = 1; i < rotationData.length; i++) {
    const start = new Date(rotationData[i][ROTATION_COLS.START_DATE]).toDateString();
    const end = new Date(rotationData[i][ROTATION_COLS.END_DATE]).toDateString();
    Logger.log(`  ${i}. ${rotationData[i][ROTATION_COLS.BACKEND]} & ${rotationData[i][ROTATION_COLS.FRONTEND]} - ${start} to ${end}`);
  }
}

// ⚠️ This posts to Slack and modifies the sheets (archives + regenerates).
// Use the read-only inspect() below if you just want to look at the state.
function test() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     TESTING ALL FUNCTIONS              ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  // Test 1: Verify setup
  Logger.log("1️⃣ Verifying Setup...");
  const engineers = getEngineersData();
  const slackToken = getSlackToken();
  Logger.log(`   ✓ Engineers: ${engineers.backend.length} Backend, ${engineers.frontend.length} Frontend`);
  Logger.log(`   ✓ Slack: ${slackToken ? "Connected" : "Missing token"}`);
  Logger.log(`   ✓ Bugs channel: ${CONFIG.BUGS_CHANNEL_ID || "NOT SET"}`);
  Logger.log("");

  // Test 2: View current rotations
  Logger.log("2️⃣ Current Rotation Schedule...");
  const rotationData = getRotationSheet().getDataRange().getValues();
  Logger.log(`   Total: ${rotationData.length - 1} assignments`);
  for (let i = 1; i <= Math.min(3, rotationData.length - 1); i++) {
    const start = new Date(rotationData[i][ROTATION_COLS.START_DATE]).toDateString();
    Logger.log(`   ${i}. ${rotationData[i][ROTATION_COLS.BACKEND]} & ${rotationData[i][ROTATION_COLS.FRONTEND]} - ${start}`);
  }
  Logger.log("");

  // Test 3: Manually trigger notifications
  Logger.log("3️⃣ Triggering Notifications...");
  Logger.log("   → sendMaintenanceHandoverNotification()");
  sendMaintenanceHandoverNotification();
  Logger.log("   → sendReminderNotification()");
  sendReminderNotification();
  Logger.log("   → maintainRotation()");
  maintainRotation();
  Logger.log("");

  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     TEST COMPLETE                      ║");
  Logger.log("╚════════════════════════════════════════╝");
}

// Read-only health check - sends nothing, changes nothing.
function inspect() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     INSPECTING CURRENT STATE           ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  const engineers = getEngineersData();
  Logger.log(`Engineers: ${engineers.backend.length} backend, ${engineers.frontend.length} frontend`);
  Logger.log(`Slack token: ${getSlackToken() ? "present" : "MISSING"}`);
  Logger.log(`Slack channel: ${getSlackChannel()}`);
  Logger.log(`Bugs channel ID: ${CONFIG.BUGS_CHANNEL_ID || "NOT SET ⚠️"}`);
  Logger.log("");

  Logger.log(`Config state:`);
  Logger.log(`  Last Backend Index:  ${getStateValue("Last Backend Index")}`);
  Logger.log(`  Last Frontend Index: ${getStateValue("Last Frontend Index")}`);
  Logger.log("");

  const data = getRotationSheet().getDataRange().getValues();
  Logger.log(`Rotation Schedule: ${data.length - 1} rows`);
  for (let i = 1; i < Math.min(4, data.length); i++) {
    const start = new Date(data[i][ROTATION_COLS.START_DATE]);
    const end = new Date(data[i][ROTATION_COLS.END_DATE]);
    const label = i === 1 ? "current" : (i === 2 ? "next" : "future");
    Logger.log(`  [${label}] ${start.toDateString()} (${CONFIG.getDayName(start.getDay())}) → ${end.toDateString()}`);
    Logger.log(`           ${data[i][ROTATION_COLS.BACKEND]} & ${data[i][ROTATION_COLS.FRONTEND]} | notified=${data[i][ROTATION_COLS.NOTIFIED]} reminder=${data[i][ROTATION_COLS.REMINDER_SENT]}`);
  }
  Logger.log("");

  const archive = getArchiveSheet().getDataRange().getValues();
  Logger.log(`Archive: ${archive.length - 1} rows`);
  if (archive.length > 1) {
    const last = archive[archive.length - 1];
    Logger.log(`  Last archived: ${last[ARCHIVE_COLS.BACKEND]} & ${last[ARCHIVE_COLS.FRONTEND]}, ended ${new Date(last[ARCHIVE_COLS.END_DATE]).toDateString()}`);
  }
  Logger.log("");

  // Continuity check: the current row must start the day after the last archived period ends
  if (data.length > 1 && archive.length > 1) {
    const currentStart = new Date(data[1][ROTATION_COLS.START_DATE]);
    currentStart.setHours(0, 0, 0, 0);
    const expectedPrevEnd = DateUtils.subtractDays(currentStart, 1);
    const found = findPreviousAssignment(expectedPrevEnd);
    if (found) {
      Logger.log(`✓ Continuity OK - predecessor found for ${expectedPrevEnd.toDateString()}: ${found.backend} & ${found.frontend}`);
    } else {
      Logger.log(`⚠️ No predecessor ending ${expectedPrevEnd.toDateString()} - handover would be skipped`);
    }
  }

  // Rotation day check
  if (data.length > 1) {
    const startDay = new Date(data[1][ROTATION_COLS.START_DATE]).getDay();
    if (startDay === CONFIG.MAINTENANCE_ROTATION_DAY) {
      Logger.log(`✓ Periods start on ${CONFIG.getDayName(startDay)}, matching the trigger day`);
    } else {
      Logger.log(`⚠️ Periods start on ${CONFIG.getDayName(startDay)} but the trigger fires on ${CONFIG.getDayName(CONFIG.MAINTENANCE_ROTATION_DAY)} - notifications will never match`);
    }
  }

  Logger.log("");
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     INSPECT COMPLETE                   ║");
  Logger.log("╚════════════════════════════════════════╝");
}

function testSlackToken() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     TESTING SLACK TOKEN                ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  const token = getSlackToken();

  if (!token) {
    Logger.log("✗ No token found in Script Properties");
    Logger.log("");
    Logger.log("How to add your token:");
    Logger.log("1. Get your token from: https://api.slack.com/apps");
    Logger.log("2. Run this in Apps Script:");
    Logger.log("   setSlackToken('xoxb-your-token-here')");
    return;
  }

  Logger.log("Token found: " + token.substring(0, 10) + "...");
  Logger.log("");
  Logger.log("Testing connection...");

  const result = SlackAPI.testConnection(token);

  if (result) {
    Logger.log("✓ Slack token works!");
  } else {
    Logger.log("✗ Slack token failed - check if it's correct");
  }

  Logger.log("");
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     TEST COMPLETE                      ║");
  Logger.log("╚════════════════════════════════════════╝");
}

// ============================================================
// INDEPENDENT NOTIFICATION TESTS
// ============================================================

function testMaintenanceHandoverNotification() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║   TESTING MAINTENANCE HANDOVER         ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  const slackToken = getSlackToken();
  if (!slackToken) {
    Logger.log("✗ Slack token not found");
    return;
  }

  const data = getRotationSheet().getDataRange().getValues();

  if (data.length < 3) {
    Logger.log("✗ Need at least two assignments to preview a handover");
    return;
  }

  // Row 2 (data[1]) = currently on maintenance = OUTGOING
  // Row 3 (data[2]) = next up                  = INCOMING
  const newAssignment = {
    rowIndex: 3,
    backend: data[2][ROTATION_COLS.BACKEND],
    frontend: data[2][ROTATION_COLS.FRONTEND],
    startDate: new Date(data[2][ROTATION_COLS.START_DATE]),
    endDate: new Date(data[2][ROTATION_COLS.END_DATE]),
    notified: data[2][ROTATION_COLS.NOTIFIED]
  };

  const prevAssignment = {
    backend: data[1][ROTATION_COLS.BACKEND],
    frontend: data[1][ROTATION_COLS.FRONTEND]
  };

  Logger.log("Previewing the NEXT handover (not today's):");
  Logger.log(`  Outgoing: ${prevAssignment.backend} & ${prevAssignment.frontend}`);
  Logger.log(`  Incoming: ${newAssignment.backend} & ${newAssignment.frontend}`);
  Logger.log(`  Period:   ${newAssignment.startDate.toDateString()} to ${newAssignment.endDate.toDateString()}`);
  Logger.log("");

  if (!CONFIG.BUGS_CHANNEL_ID || CONFIG.BUGS_CHANNEL_ID.indexOf("XXX") >= 0) {
    Logger.log("⚠️ CONFIG.BUGS_CHANNEL_ID is not set - the message will show a broken channel link");
    Logger.log("");
  }

  Logger.log("Sending notification...");
  notifyHandover(newAssignment, prevAssignment);

  Logger.log("");
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║   TEST COMPLETE                        ║");
  Logger.log("╚════════════════════════════════════════╝");
}

function testReminderNotification() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║   TESTING REMINDER NOTIFICATION        ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  const slackToken = getSlackToken();
  const slackChannel = getSlackChannel();

  if (!slackToken || !slackChannel) {
    Logger.log("✗ Slack configuration not found");
    return;
  }

  const data = getRotationSheet().getDataRange().getValues();

  if (data.length < 3) {
    Logger.log("✗ Need at least two assignments to preview a reminder");
    return;
  }

  // Row 2 = current (outgoing), row 3 = next (incoming)
  const currentAssignment = {
    backend: data[1][ROTATION_COLS.BACKEND],
    frontend: data[1][ROTATION_COLS.FRONTEND]
  };

  const nextAssignment = {
    backend: data[2][ROTATION_COLS.BACKEND],
    frontend: data[2][ROTATION_COLS.FRONTEND]
  };

  const nextRotationDate = new Date(data[2][ROTATION_COLS.START_DATE]);

  Logger.log(`Testing with assignments:`);
  Logger.log(`  Current: ${currentAssignment.backend} & ${currentAssignment.frontend}`);
  Logger.log(`  Next:    ${nextAssignment.backend} & ${nextAssignment.frontend}`);
  Logger.log(`  Rotates: ${nextRotationDate.toDateString()}`);
  Logger.log("");

  const engineers = getEngineersData();

  const message = buildChangeNotificationMessage(
    formatMention(currentAssignment.backend, engineers.userIds), formatMention(nextAssignment.backend, engineers.userIds),
    formatMention(currentAssignment.frontend, engineers.userIds), formatMention(nextAssignment.frontend, engineers.userIds),
    nextRotationDate
  );

  Logger.log("Sending notification...");
  sendSlackMessageOrThrow(slackToken, slackChannel, message, "test reminder");

  Logger.log("");
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║   TEST COMPLETE                        ║");
  Logger.log("╚════════════════════════════════════════╝");
}

function testBothNotifications() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║   TESTING BOTH NOTIFICATIONS           ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  Logger.log("1️⃣ Maintenance Handover Notification");
  Logger.log("─".repeat(40));
  testMaintenanceHandoverNotification();

  Logger.log("");
  Logger.log("2️⃣ Reminder Notification");
  Logger.log("─".repeat(40));
  testReminderNotification();

  Logger.log("");
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║   ALL TESTS COMPLETE                   ║");
  Logger.log("╚════════════════════════════════════════╝");
}

function debugEngineersList() {
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     DEBUGGING ENGINEERS LIST           ║");
  Logger.log("╚════════════════════════════════════════╝");
  Logger.log("");

  const engineers = getEngineersData();

  Logger.log("Backend Engineers:");
  for (const engineer of engineers.backend) {
    const userId = engineers.userIds[engineer] || "NOT SET";
    Logger.log(`  ${engineer} → ${userId}`);
  }

  Logger.log("");
  Logger.log("Frontend Engineers:");
  for (const engineer of engineers.frontend) {
    const userId = engineers.userIds[engineer] || "NOT SET";
    Logger.log(`  ${engineer} → ${userId}`);
  }

  Logger.log("");
  Logger.log("Missing Slack User IDs:");
  let missingCount = 0;
  for (const engineer of [...engineers.backend, ...engineers.frontend]) {
    if (!engineers.userIds[engineer]) {
      Logger.log(`  ⚠️ ${engineer}`);
      missingCount++;
    }
  }

  if (missingCount === 0) {
    Logger.log("  ✓ All engineers have Slack User IDs set");
  }

  Logger.log("");
  Logger.log("Cross-check against Rotation Schedule:");
  const rotationData = getRotationSheet().getDataRange().getValues();
  const unknown = new Set();
  for (let i = 1; i < rotationData.length; i++) {
    const b = rotationData[i][ROTATION_COLS.BACKEND];
    const f = rotationData[i][ROTATION_COLS.FRONTEND];
    if (b && engineers.backend.indexOf(b) < 0) unknown.add(b);
    if (f && engineers.frontend.indexOf(f) < 0) unknown.add(f);
  }
  if (unknown.size === 0) {
    Logger.log("  ✓ Every scheduled name matches an engineer exactly");
  } else {
    unknown.forEach(n => Logger.log(`  ⚠️ "${n}" is scheduled but not in Engineers (typo or whitespace?)`));
  }

  Logger.log("");
  Logger.log("╔════════════════════════════════════════╗");
  Logger.log("║     DEBUG COMPLETE                     ║");
  Logger.log("╚════════════════════════════════════════╝");
}