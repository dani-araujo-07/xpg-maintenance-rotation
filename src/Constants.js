const SHEETS = {
  ENGINEERS: "Engineers",
  ROTATION: "Rotation Schedule",
  CONFIG: "Config",
  ARCHIVE: "Archive"
};

const PROPERTY_KEYS = {
  SLACK_TOKEN: "SLACK_BOT_TOKEN",
  LAST_BACKEND_INDEX: "LAST_BACKEND_INDEX",
  LAST_FRONTEND_INDEX: "LAST_FRONTEND_INDEX"
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MESSAGES = {
  HANDOVER_HEADER: "🔄 Maintenance Rotation Handover",
  HANDOVER_DESCRIPTION: "Please coordinate a handover in both directions:",
  HANDOVER_OUTGOING: "• Outgoing → incoming: in-progress maintenance tasks",
  HANDOVER_INCOMING: "• Incoming → outgoing: project tasks without an open PR (work still remains on them)",
  HANDOVER_NEXT_STEPS: "Once handed over, incoming folks can start on maintenance tasks marked \"Ready for Development\" and should keep an eye on <#{BUGS_CHANNEL_ID}> for urgent incoming issues.",
  HANDOVER_NOTE: "🔗 *Note:* The frontend engineer on rotation also covers the responsibilities of the <https://app.notion.com/p/storyblok/Frontend-Engineering-Hub-a88d0ecc03c541b39ed87ce4539382a2?source=copy_link#34b84ab4f0f380bca6dbfe51a067bb3f|former Primary Interrupt role>.",

  CHANGES_HEADER: "🔧 Maintenance Rotation Changes on Monday",
  CHANGES_PREPARE: "Prepare your task handover before Monday at {TIME}",
  CHANGES_CHECK: "Please check your calendars for PTO and coordinate coverage if needed."
};

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
