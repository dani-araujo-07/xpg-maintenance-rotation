function onOpen() {
  SpreadsheetApp.getUi().createMenu("Rotation")
    .addItem("Check setup", "menuCheckSetup")
    .addItem("Top up schedule now", "menuTopUpSchedule")
    .addItem("Send message previews", "menuSendPreviews")
    .addSeparator()
    .addItem("Set Slack token…", "menuSetSlackToken")
    .addItem("Install triggers…", "menuInstallTriggers")
    .addItem("Set up sheets", "menuSetUpSheets")
    .addSeparator()
    .addItem("Regenerate schedule…", "menuRegenerateSchedule")
    .addToUi();
}

function menuCheckSetup() {
  runFromMenu("Setup check", () => {
    const results = validateSetup();
    const errors = results.filter(r => r.level === CHECK.ERROR).length;
    const warnings = results.filter(r => r.level === CHECK.WARNING).length;
    const icons = { ok: "✓", warning: "⚠️", error: "✗" };

    const summary = errors
      ? `${errors} error(s) - notifications may not be sent until they are fixed.`
      : warnings ? `No errors, ${warnings} warning(s).` : "Everything looks good.";
    const order = [CHECK.ERROR, CHECK.WARNING, CHECK.OK];
    const lines = results
      .slice()
      .sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))
      .map(r => `${icons[r.level]} ${r.message}`);

    return `${summary}\n\n${lines.join("\n")}`;
  });
}

function menuTopUpSchedule() {
  runFromMenu("Top up schedule", () => {
    maintainRotation();
    return "Finished rotations were archived and the schedule was topped up.";
  });
}

function menuSendPreviews() {
  runFromMenu("Send message previews", () => {
    const channel = previewMessages();
    return `Previews of the next reminder and handover were sent to ${channel}.\n\nNobody was mentioned and nothing in the sheets was changed.`;
  });
}

function menuSetSlackToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt("Set Slack token", "Paste the Slack bot token (starts with xoxb-):", ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  runFromMenu("Set Slack token", () => {
    const token = response.getResponseText().trim();
    if (!token.startsWith("xoxb-")) {
      throw new Error("That doesn't look like a bot token - it should start with xoxb-. Nothing was saved.");
    }
    return setSlackToken(token)
      ? "Token saved and verified with Slack."
      : "Token saved, but Slack rejected it. Check the token and set it again.";
  });
}

function menuInstallTriggers() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    "Install triggers",
    "The scheduled archive, handover and reminder runs will run as you (your Google account).\n\n" +
    "This replaces any triggers you already installed on this spreadsheet. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  runFromMenu("Install triggers", () => {
    setupTriggers();
    const config = getConfig();
    const at = (day, hour) => `${DAY_NAMES[day]} ${hour}:00`;
    return [
      "Triggers installed:",
      `• Archive and top up: ${at(config.ROTATION_DAY, config.ARCHIVE_HOUR)}`,
      `• Handover message: ${at(config.ROTATION_DAY, config.ROTATION_START_HOUR)}`,
      `• Reminder message: ${at(config.REMINDER_DAY, config.REMINDER_HOUR)}`,
      "",
      "Run this again after changing days or hours in the Config sheet."
    ].join("\n");
  });
}

function menuSetUpSheets() {
  runFromMenu("Set up sheets", () => {
    createSheets();
    setupConfigSheet();
    setupMessagesSheet();
    return "Sheets are ready. Existing values were kept and any new settings or messages were added.";
  });
}

function menuRegenerateSchedule() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    "Regenerate schedule",
    "This deletes every upcoming rotation in the Rotation Schedule, including manual swaps, and creates a fresh schedule that continues from the archive.\n\n" +
    "The archive is not changed. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  runFromMenu("Regenerate schedule", () => {
    initializeRotation();
    return `Schedule regenerated with ${getConfig().MAX_FUTURE_ASSIGNMENTS} rotations.`;
  });
}

function runFromMenu(title, action) {
  const ui = SpreadsheetApp.getUi();
  try {
    resetConfigCache();
    resetMessagesCache();
    ui.alert(title, action(), ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(`✗ ${title} failed: ${e.message}`);
    ui.alert(`${title} failed`, e.message, ui.ButtonSet.OK);
  }
}
