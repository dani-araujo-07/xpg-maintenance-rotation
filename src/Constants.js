const SHEETS = {
  ENGINEERS: "Engineers",
  ROTATION: "Rotation Schedule",
  CONFIG: "Config",
  ARCHIVE: "Archive",
  MESSAGES: "Messages"
};

const PROPERTY_KEYS = {
  SLACK_TOKEN: "SLACK_BOT_TOKEN",
  LAST_BACKEND_INDEX: "LAST_BACKEND_INDEX",
  LAST_FRONTEND_INDEX: "LAST_FRONTEND_INDEX"
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
