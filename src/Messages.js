const MESSAGE_DEFINITIONS = [
  { key: "HANDOVER_HEADER",
    default: "🔄 Maintenance Rotation Handover",
    description: "Handover message (rotation day): title. Plain text, no formatting." },
  { key: "HANDOVER_ASSIGNMENTS",
    default: "• *Backend:* {BACKEND}\n• *Frontend:* {FRONTEND}",
    description: "Handover message: who hands over to whom." },
  { key: "HANDOVER_PERIOD",
    default: ":calendar: *Maintenance Period:* {DURATION}\n{START}  →  {END}",
    description: "Handover message: the new rotation's period." },
  { key: "HANDOVER_INSTRUCTIONS",
    default: "Please coordinate a handover in both directions:\n• Outgoing → incoming: in-progress maintenance tasks\n• Incoming → outgoing: project tasks without an open PR (work still remains on them)",
    description: "Handover message: what to hand over." },
  { key: "HANDOVER_NEXT_STEPS",
    default: "Once handed over, incoming folks can start on maintenance tasks marked \"Ready for Development\" and should keep an eye on {BUGS_CHANNEL} for urgent incoming issues.",
    description: "Handover message: what to do next." },
  { key: "HANDOVER_NOTE",
    default: "",
    description: "Handover message: small print footnote at the bottom." },
  { key: "REMINDER_HEADER",
    default: "🔧 Maintenance Rotation Changes on {DAY}",
    description: "Reminder message (a few days before): title. Plain text, no formatting." },
  { key: "REMINDER_ASSIGNMENTS",
    default: "• *Backend:* {BACKEND}\n• *Frontend:* {FRONTEND}",
    description: "Reminder message: who hands over to whom." },
  { key: "REMINDER_BODY",
    default: ":alarm_clock: Prepare your task handover before {DAY} at {TIME}\n:calendar: Please check your calendars for PTO and coordinate coverage if needed.",
    description: "Reminder message: what to prepare." }
];

const MESSAGE_PLACEHOLDERS = [
  ["{BACKEND}", "Outgoing → incoming backend engineer (only the incoming one if there is no previous rotation)"],
  ["{FRONTEND}", "Outgoing → incoming frontend engineer (only the incoming one if there is no previous rotation)"],
  ["{NEW_BACKEND}", "Incoming backend engineer"],
  ["{NEW_FRONTEND}", "Incoming frontend engineer"],
  ["{PREV_BACKEND}", "Outgoing backend engineer (empty if there is no previous rotation)"],
  ["{PREV_FRONTEND}", "Outgoing frontend engineer (empty if there is no previous rotation)"],
  ["{START}", "When the rotation starts, e.g. Mon, Oct 5, 2026, 15:00 CEST"],
  ["{END}", "When the rotation ends (the next handover), e.g. Mon, Oct 19, 2026, 15:00 CEST"],
  ["{DAY}", "Rotation weekday from the Config sheet, e.g. Monday"],
  ["{TIME}", "Rotation start time, e.g. 15:00 CEST"],
  ["{DURATION}", "Rotation length, e.g. 2 weeks"],
  ["{BUGS_CHANNEL}", "Link to BUGS_CHANNEL_ID from the Config sheet"],
  ["{TEAM_NAME}", "TEAM_NAME from the Config sheet"]
];

let messagesCache = null;

function getMessages() {
  if (messagesCache) return messagesCache;

  const sheetValues = readMessagesSheetValues();
  messagesCache = {};
  for (const definition of MESSAGE_DEFINITIONS) {
    messagesCache[definition.key] = definition.key in sheetValues ? sheetValues[definition.key] : definition.default;
  }
  return messagesCache;
}

function resetMessagesCache() {
  messagesCache = null;
}

function readMessagesSheetValues() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MESSAGES);
  const values = {};
  if (!sheet) return values;

  const known = new Set(MESSAGE_DEFINITIONS.map(d => d.key));
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    if (known.has(key)) values[key] = String(data[i][1]).trim();
  }
  return values;
}

function renderMessage(key, values) {
  return getMessages()[key].replace(/\{([A-Z_]+)\}/g, (match, name) => (name in values ? values[name] : match));
}

function setupMessagesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MESSAGES) || ss.insertSheet(SHEETS.MESSAGES);
  const existing = readMessagesSheetValues();

  const rows = MESSAGE_DEFINITIONS.map(definition => [
    definition.key,
    definition.key in existing ? existing[definition.key] : definition.default,
    definition.description
  ]);

  const placeholderStart = rows.length + 3;

  sheet.clear();
  sheet.getRange(1, 1, 1, 3).setValues([["Key", "Message", "Description"]]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.getRange(2, 2, rows.length, 1).setNumberFormat("@").setWrap(true);
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);

  sheet.getRange(placeholderStart, 1, 1, 2).setValues([["Placeholder", "Replaced with"]]).setFontWeight("bold");
  sheet.getRange(placeholderStart + 1, 1, MESSAGE_PLACEHOLDERS.length, 2).setValues(MESSAGE_PLACEHOLDERS);

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 520);
  sheet.setColumnWidth(3, 360);

  resetMessagesCache();
  Logger.log("✓ Messages sheet ready");
}
