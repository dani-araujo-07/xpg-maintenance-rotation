// ============================================================
// MAINTENANCE ROTATION & SLACK NOTIFICATION SYSTEM
// ============================================================

const CONFIG = {
  // ============================================================
  // SHEET CONFIGURATION
  // ============================================================
  ENGINEERS_SHEET: "Engineers",
  ROTATION_SHEET: "Rotation Schedule",
  CONFIG_SHEET: "Config",
  ARCHIVE_SHEET: "Archive",

  // ============================================================
  // TIMING CONFIGURATION
  // ============================================================
  TIMEZONE: "Europe/Berlin",
  DAYS_IN_MAINTENANCE: 14,
  MAX_FUTURE_ASSIGNMENTS: 12,
  ROTATION_START_DATE: "2026-09-06",   // treated as the END of the period before the first one

  // ============================================================
  // MAINTENANCE ROTATION SCHEDULE
  // ============================================================
  MAINTENANCE_ROTATION_DAY: 1,         // Day to rotate (0=Sunday, 1=Monday, 2=Tuesday, etc.)
  MAINTENANCE_START_HOUR: 15,          // Hour maintenance starts (3pm)
  MAINTENANCE_ARCHIVE_HOUR: 1,         // Hour to archive past rotations (1am same day)

  REMINDER_DAY: 4,                     // Day to send reminders (0=Sunday, ..., 4=Thursday, 5=Friday)
  REMINDER_HOUR: 15,                   // Hour to send reminders (3pm)

  // ============================================================
  // SLACK CONFIGURATION
  // ============================================================
  SLACK_CHANNEL_NOTIFICATIONS: "product-xpg-publishing-ops-team",
  BUGS_CHANNEL_ID: "C0C1NMYJFGW",

  // ============================================================
  // MESSAGE TEMPLATES
  // ============================================================
  MESSAGES: {
    HANDOVER_HEADER: "🔄 Maintenance Rotation Handover",
    HANDOVER_DESCRIPTION: "Please coordinate a handover in both directions:",
    HANDOVER_OUTGOING: "• Outgoing → incoming: in-progress maintenance tasks",
    HANDOVER_INCOMING: "• Incoming → outgoing: project tasks without an open PR (work still remains on them)",
    HANDOVER_NEXT_STEPS: "Once handed over, incoming folks can start on maintenance tasks marked \"Ready for Development\" and should keep an eye on <#{BUGS_CHANNEL_ID}> for urgent incoming issues.",
    HANDOVER_NOTE: "🔗 *Note:* The frontend engineer on rotation also covers the responsibilities of the <https://app.notion.com/p/storyblok/Frontend-Engineering-Hub-a88d0ecc03c541b39ed87ce4539382a2?source=copy_link#34b84ab4f0f380bca6dbfe51a067bb3f|former Primary Interrupt role>.",

    CHANGES_HEADER: "🔧 Maintenance Rotation Changes on Monday",
    CHANGES_PREPARE: "Prepare your task handover before Monday at {TIME}",
    CHANGES_CHECK: "Please check your calendars for PTO and coordinate coverage if needed."
  },

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  getMaintenanceStartTimeDisplay(date) {
    const ref = date || new Date();
    const tz = Utilities.formatDate(ref, this.TIMEZONE, "z");
    return `${this.MAINTENANCE_START_HOUR}:00 ${tz}`;
  },

  getDurationText() {
    return this.DAYS_IN_MAINTENANCE === 14 ? "2 weeks" : `${this.DAYS_IN_MAINTENANCE} days`;
  },

  getDayName(dayNumber) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[dayNumber] || "Unknown";
  }
};

// ============================================================
// COLUMN INDICES (zero-based; add 1 for getRange)
// ============================================================

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
