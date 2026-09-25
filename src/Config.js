const SETTINGS = [
  { key: "TEAM_NAME", type: "text", default: "",
    description: "Team name, shown in logs." },
  { key: "SLACK_CHANNEL", type: "text", default: "",
    description: "Channel for handover and reminder messages: a channel ID (C0123...) or a name without #." },
  { key: "BUGS_CHANNEL_ID", type: "text", default: "",
    description: "Channel ID linked in the handover message for urgent incoming issues." },
  { key: "DAYS_IN_MAINTENANCE", type: "number", default: 14,
    description: "Length of one rotation in days." },
  { key: "MAX_FUTURE_ASSIGNMENTS", type: "number", default: 12,
    description: "Number of rotations kept in the schedule, including the current one." },
  { key: "FIRST_ROTATION_DATE", type: "date", default: "",
    description: "Start date of the first rotation (yyyy-mm-dd). Only used when the schedule and archive are both empty. Must fall on ROTATION_DAY." },
  { key: "ROTATION_DAY", type: "weekday", default: 1,
    description: "Weekday the rotation changes." },
  { key: "ROTATION_START_HOUR", type: "hour", default: 15,
    description: "Hour (0-23) the new rotation starts and the handover message is sent." },
  { key: "ARCHIVE_HOUR", type: "hour", default: 1,
    description: "Hour (0-23) on ROTATION_DAY when finished rotations are archived and the schedule is topped up." },
  { key: "REMINDER_DAY", type: "weekday", default: 4,
    description: "Weekday the reminder is sent before a rotation change." },
  { key: "REMINDER_HOUR", type: "hour", default: 15,
    description: "Hour (0-23) the reminder is sent." }
];

const SETTING_TYPE_LABELS = {
  text: "Text",
  number: "Whole number",
  hour: "Hour (0-23)",
  weekday: "Weekday",
  date: "Date (yyyy-mm-dd)"
};

let configCache = null;

function getConfig() {
  if (configCache) return configCache;

  const { values, errors } = loadConfig();
  if (errors.length) {
    throw new Error(`Invalid Config sheet:\n- ${errors.join("\n- ")}`);
  }

  configCache = values;
  return configCache;
}

function resetConfigCache() {
  configCache = null;
}

function loadConfig() {
  const raw = readConfigSheetValues();
  const values = {};
  const errors = [];

  for (const setting of SETTINGS) {
    const value = isBlank(raw[setting.key]) ? setting.default : raw[setting.key];
    try {
      values[setting.key] = parseSettingValue(setting, value);
    } catch (e) {
      errors.push(`${setting.key}: ${e.message}`);
    }
  }

  return { values, errors };
}

function readConfigSheetValues() {
  const sheet = getConfigSheet();
  const raw = {};
  if (!sheet) return raw;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    if (key) raw[key] = data[i][1];
  }
  return raw;
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function parseSettingValue(setting, value) {
  switch (setting.type) {
    case "text":
      return String(value).trim();

    case "number": {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new Error(`must be a whole number of at least 1, got "${value}"`);
      return n;
    }

    case "hour": {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 23) throw new Error(`must be an hour from 0 to 23, got "${value}"`);
      return n;
    }

    case "weekday":
      return parseWeekday(value);

    case "date":
      return isBlank(value) ? null : parseDateValue(value);

    default:
      throw new Error(`unknown setting type "${setting.type}"`);
  }
}

function parseWeekday(value) {
  const text = String(value).trim();
  if (/^[0-6]$/.test(text)) return Number(text);

  const index = DAY_NAMES.findIndex(day => day.toLowerCase() === text.toLowerCase());
  if (index >= 0) return index;

  throw new Error(`must be a weekday name like Monday, got "${value}"`);
}

function parseDateValue(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new Error("is not a valid date");
    return DateUtils.atMidnight(value);
  }

  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`must be a date as yyyy-mm-dd, got "${value}"`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatSettingValue(setting, value) {
  if (isBlank(value)) return "";
  if (setting.type === "weekday") return DAY_NAMES[parseWeekday(value)];
  if (setting.type === "date" && value instanceof Date) {
    return Utilities.formatDate(value, getTimeZone(), "yyyy-MM-dd");
  }
  return String(value);
}

function setupConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.CONFIG) || ss.insertSheet(SHEETS.CONFIG);
  const existing = readConfigSheetValues();

  migrateLegacyRotationIndices(existing);

  const rows = SETTINGS.map(setting => [
    setting.key,
    formatSettingValue(setting, isBlank(existing[setting.key]) ? setting.default : existing[setting.key]),
    SETTING_TYPE_LABELS[setting.type],
    setting.description
  ]);

  sheet.clear();
  sheet.getDataRange().clearDataValidations();
  sheet.getRange(1, 1, 1, 4).setValues([["Key", "Value", "Type", "Description"]]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.getRange(2, 2, rows.length, 1).setNumberFormat("@");
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);

  const weekdayRule = SpreadsheetApp.newDataValidation().requireValueInList(DAY_NAMES, true).build();
  SETTINGS.forEach((setting, i) => {
    if (setting.type === "weekday") sheet.getRange(i + 2, 2).setDataValidation(weekdayRule);
  });

  sheet.autoResizeColumns(1, 4);

  resetConfigCache();
  Logger.log("✓ Config sheet ready");
}
