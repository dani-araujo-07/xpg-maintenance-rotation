const CHECK = { OK: "ok", WARNING: "warning", ERROR: "error" };

const TRIGGER_HANDLERS = ["maintainRotation", "sendMaintenanceHandoverNotification", "sendReminderNotification"];

function validateSetup() {
  const results = [];
  const add = (level, message) => results.push({ level, message });

  const missingSheets = [SHEETS.ENGINEERS, SHEETS.ROTATION, SHEETS.ARCHIVE, SHEETS.CONFIG]
    .filter(name => !SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name));
  if (missingSheets.length) {
    add(CHECK.ERROR, `Missing sheets: ${missingSheets.join(", ")}. Run "Set up sheets".`);
    return logValidationResults(results);
  }
  if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MESSAGES)) {
    add(CHECK.WARNING, `No ${SHEETS.MESSAGES} sheet - default messages are used. Run "Set up sheets" to customise them.`);
  }

  resetConfigCache();
  resetMessagesCache();
  const { values: config, errors } = loadConfig();
  errors.forEach(e => add(CHECK.ERROR, `Config: ${e}`));
  if (errors.length) return logValidationResults(results);

  validateSlack(config, add);
  validateTimezone(add);
  const engineers = validateEngineers(add);
  validateSchedule(config, engineers, add);
  validateMessages(config, add);
  validateTriggers(add);

  return logValidationResults(results);
}

function validateSlack(config, add) {
  const token = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.SLACK_TOKEN);
  if (!token) {
    add(CHECK.ERROR, "Slack token missing. Use Rotation → Set Slack token.");
  } else if (!SlackAPI.testConnection(token)) {
    add(CHECK.ERROR, "Slack token rejected by Slack. Set it again with Rotation → Set Slack token.");
  } else {
    add(CHECK.OK, "Slack token works");
  }

  if (!config.SLACK_CHANNEL) {
    add(CHECK.ERROR, "Config: SLACK_CHANNEL is empty");
  } else if (!isSlackChannelId(config.SLACK_CHANNEL) && !/^[a-z0-9._-]+$/.test(config.SLACK_CHANNEL)) {
    add(CHECK.ERROR, `Config: SLACK_CHANNEL "${config.SLACK_CHANNEL}" is neither a channel ID nor a channel name (lowercase, no #)`);
  } else {
    add(CHECK.OK, `Slack channel: ${config.SLACK_CHANNEL}`);
  }

  if (config.BUGS_CHANNEL_ID && !isSlackChannelId(config.BUGS_CHANNEL_ID)) {
    add(CHECK.ERROR, `Config: BUGS_CHANNEL_ID "${config.BUGS_CHANNEL_ID}" is not a channel ID (like C0123ABCD)`);
  }
}

function isSlackChannelId(value) {
  return /^[CG][A-Z0-9]{8,}$/.test(value);
}

function validateTimezone(add) {
  const scriptZone = getTimeZone();
  const sheetZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  if (scriptZone !== sheetZone) {
    add(CHECK.ERROR, `Timezone mismatch: script uses ${scriptZone}, spreadsheet uses ${sheetZone}. Change the spreadsheet timezone in File → Settings.`);
  } else {
    add(CHECK.OK, `Timezone: ${scriptZone}`);
  }
}

function validateEngineers(add) {
  const engineers = getEngineersData();
  const data = getEngineersSheet().getDataRange().getValues().slice(1);

  if (!engineers.backend.length) add(CHECK.ERROR, "Engineers: no backend engineers");
  if (!engineers.frontend.length) add(CHECK.ERROR, "Engineers: no frontend engineers");

  const names = data.map(row => row[0]).filter(Boolean);
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  if (duplicates.length) add(CHECK.ERROR, `Engineers: duplicate names: ${[...new Set(duplicates)].join(", ")}`);

  const unknownArea = data.filter(row => row[0] && !/backend|frontend/i.test(String(row[1]))).map(row => row[0]);
  if (unknownArea.length) add(CHECK.WARNING, `Engineers: not backend or frontend, so never scheduled: ${unknownArea.join(", ")}`);

  const withoutSlackId = [...engineers.backend, ...engineers.frontend].filter(name => !engineers.userIds[name]);
  if (withoutSlackId.length) add(CHECK.WARNING, `Engineers: no Slack User ID (shown by name, not mentioned): ${withoutSlackId.join(", ")}`);

  if (engineers.backend.length && engineers.frontend.length) {
    add(CHECK.OK, `Engineers: ${engineers.backend.length} backend, ${engineers.frontend.length} frontend`);
  }
  return engineers;
}

function validateSchedule(config, engineers, add) {
  const rows = getRotationSheet().getDataRange().getValues().slice(1).filter(row => row[ROTATION_COLS.START_DATE]);
  const archive = getArchiveSheet().getDataRange().getValues().slice(1).filter(row => row[ARCHIVE_COLS.END_DATE]);

  if (!rows.length) {
    if (archive.length) {
      add(CHECK.WARNING, "Schedule is empty - it will be regenerated from the archive on the next archive run");
    } else if (!config.FIRST_ROTATION_DATE) {
      add(CHECK.ERROR, "Schedule and archive are empty and FIRST_ROTATION_DATE is not set");
    } else if (config.FIRST_ROTATION_DATE.getDay() !== config.ROTATION_DAY) {
      add(CHECK.ERROR, `FIRST_ROTATION_DATE is a ${DAY_NAMES[config.FIRST_ROTATION_DATE.getDay()]}, but ROTATION_DAY is ${DAY_NAMES[config.ROTATION_DAY]}`);
    } else {
      add(CHECK.WARNING, "Schedule is empty - use Rotation → Regenerate schedule");
    }
    return;
  }

  const starts = rows.map(row => DateUtils.atMidnight(row[ROTATION_COLS.START_DATE]));
  const ends = rows.map(row => DateUtils.atMidnight(row[ROTATION_COLS.END_DATE]));
  const describe = date => Utilities.formatDate(date, getTimeZone(), "EEE, MMM d, yyyy");

  const wrongDay = starts.filter(start => start.getDay() !== config.ROTATION_DAY);
  if (wrongDay.length) {
    add(CHECK.ERROR, `Schedule: ${wrongDay.length} rotation(s) don't start on ${DAY_NAMES[config.ROTATION_DAY]}, so no notifications are sent for them (first: ${describe(wrongDay[0])})`);
  }

  for (let i = 1; i < rows.length; i++) {
    if (!DateUtils.isSameDay(starts[i], DateUtils.addDays(ends[i - 1], 1))) {
      add(CHECK.ERROR, `Schedule: gap or overlap between the rotation ending ${describe(ends[i - 1])} and the one starting ${describe(starts[i])}`);
    }
  }

  const wrongLength = rows.filter((row, i) => Math.round((ends[i] - starts[i]) / 86400000) + 1 !== config.DAYS_IN_MAINTENANCE);
  if (wrongLength.length) {
    add(CHECK.WARNING, `Schedule: ${wrongLength.length} rotation(s) are not ${config.DAYS_IN_MAINTENANCE} days long`);
  }

  const unknownNames = new Set();
  rows.forEach(row => {
    if (engineers.backend.indexOf(row[ROTATION_COLS.BACKEND]) < 0) unknownNames.add(row[ROTATION_COLS.BACKEND]);
    if (engineers.frontend.indexOf(row[ROTATION_COLS.FRONTEND]) < 0) unknownNames.add(row[ROTATION_COLS.FRONTEND]);
  });
  if (unknownNames.size) {
    add(CHECK.WARNING, `Schedule: names not found in Engineers (typo or extra spaces?): ${[...unknownNames].join(", ")}`);
  }

  if (archive.length) {
    const lastArchivedEnd = DateUtils.atMidnight(archive[archive.length - 1][ARCHIVE_COLS.END_DATE]);
    if (!DateUtils.isSameDay(starts[0], DateUtils.addDays(lastArchivedEnd, 1))) {
      add(CHECK.ERROR, `Archive ends ${describe(lastArchivedEnd)} but the schedule starts ${describe(starts[0])}. The next handover won't find the outgoing pair.`);
    }
  }

  if (rows.length < config.MAX_FUTURE_ASSIGNMENTS) {
    add(CHECK.WARNING, `Schedule has ${rows.length} of ${config.MAX_FUTURE_ASSIGNMENTS} rotations - it is topped up on the next archive run`);
  }

  const current = rows[0];
  add(CHECK.OK, `Current rotation: ${current[ROTATION_COLS.BACKEND]} & ${current[ROTATION_COLS.FRONTEND]} (${describe(starts[0])} → ${describe(ends[0])})`);
}

function validateMessages(config, add) {
  const known = new Set(MESSAGE_PLACEHOLDERS.map(([placeholder]) => placeholder.slice(1, -1)));
  const messages = getMessages();

  for (const key of Object.keys(messages)) {
    const unknown = (messages[key].match(/\{[A-Z_]+\}/g) || []).filter(p => !known.has(p.slice(1, -1)));
    if (unknown.length) add(CHECK.WARNING, `Messages: ${key} uses unknown placeholder(s) ${unknown.join(", ")}`);
  }

  const usesBugsChannel = Object.values(messages).some(text => text.indexOf("{BUGS_CHANNEL}") >= 0);
  if (usesBugsChannel && !config.BUGS_CHANNEL_ID) {
    add(CHECK.WARNING, "Messages use {BUGS_CHANNEL} but BUGS_CHANNEL_ID is empty in Config");
  }

  if (!messages.HANDOVER_HEADER) add(CHECK.WARNING, "Messages: HANDOVER_HEADER is empty - the Slack notification preview will be generic");
  if (!messages.REMINDER_HEADER) add(CHECK.WARNING, "Messages: REMINDER_HEADER is empty - the Slack notification preview will be generic");
}

function validateTriggers(add) {
  const installed = ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction());
  const missing = TRIGGER_HANDLERS.filter(handler => installed.indexOf(handler) < 0);
  if (missing.length) {
    add(CHECK.WARNING, `Triggers not installed by you: ${missing.join(", ")}. If nobody else installed them, use Rotation → Install triggers.`);
  } else {
    add(CHECK.OK, "Triggers installed");
  }
}

function logValidationResults(results) {
  const icons = { ok: "✓", warning: "⚠️", error: "✗" };
  results.forEach(r => Logger.log(`${icons[r.level]} ${r.message}`));
  return results;
}
