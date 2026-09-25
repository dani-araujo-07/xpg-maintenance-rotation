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
  Logger.log(`Bugs channel ID: ${getConfig().BUGS_CHANNEL_ID || "NOT SET ⚠️"}`);
  Logger.log("");

  Logger.log(`Rotation state:`);
  Logger.log(`  Last Backend Index:  ${getRotationIndex(PROPERTY_KEYS.LAST_BACKEND_INDEX)}`);
  Logger.log(`  Last Frontend Index: ${getRotationIndex(PROPERTY_KEYS.LAST_FRONTEND_INDEX)}`);
  Logger.log("");

  const data = getRotationSheet().getDataRange().getValues();
  Logger.log(`Rotation Schedule: ${data.length - 1} rows`);
  for (let i = 1; i < Math.min(4, data.length); i++) {
    const start = new Date(data[i][ROTATION_COLS.START_DATE]);
    const end = new Date(data[i][ROTATION_COLS.END_DATE]);
    const label = i === 1 ? "current" : (i === 2 ? "next" : "future");
    Logger.log(`  [${label}] ${start.toDateString()} (${DAY_NAMES[start.getDay()]}) → ${end.toDateString()}`);
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
    if (startDay === getConfig().ROTATION_DAY) {
      Logger.log(`✓ Periods start on ${DAY_NAMES[startDay]}, matching the trigger day`);
    } else {
      Logger.log(`⚠️ Periods start on ${DAY_NAMES[startDay]} but the trigger fires on ${DAY_NAMES[getConfig().ROTATION_DAY]} - notifications will never match`);
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

function previewMessages() {
  const channel = getPreviewChannel();
  const token = getSlackToken();
  if (!token) throw new Error("Slack token not configured");

  const rows = getRotationSheet().getDataRange().getValues().slice(1).filter(row => row[ROTATION_COLS.START_DATE]);
  if (rows.length < 2) throw new Error("Need at least two rotations in the schedule to preview the next handover");

  const toAssignment = row => ({
    backend: row[ROTATION_COLS.BACKEND],
    frontend: row[ROTATION_COLS.FRONTEND],
    startDate: new Date(row[ROTATION_COLS.START_DATE]),
    endDate: new Date(row[ROTATION_COLS.END_DATE])
  });
  const current = toAssignment(rows[0]);
  const next = toAssignment(rows[1]);

  const previews = [
    ["reminder", composeReminderMessage(next, current, false)],
    ["handover", composeHandoverMessage(next, current, false)]
  ];
  for (const [name, message] of previews) {
    sendSlackMessageOrThrow(token, channel, markAsPreview(message), `${name} preview`);
  }

  Logger.log(`✓ Sent reminder and handover previews for ${next.backend} & ${next.frontend} to ${channel}`);
  return channel;
}

function getPreviewChannel() {
  const config = getConfig();
  if (!config.TEST_CHANNEL) {
    throw new Error("TEST_CHANNEL is empty in the Config sheet - previews are disabled");
  }
  if (config.TEST_CHANNEL === config.SLACK_CHANNEL) {
    throw new Error("TEST_CHANNEL must be different from SLACK_CHANNEL");
  }
  return config.TEST_CHANNEL;
}

function markAsPreview(message) {
  const label = `🧪 *Preview* - the real message goes to ${getConfig().SLACK_CHANNEL}, with @-mentions instead of names`;
  return {
    text: `[Preview] ${message.text}`,
    blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: label }] }, ...message.blocks]
  };
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