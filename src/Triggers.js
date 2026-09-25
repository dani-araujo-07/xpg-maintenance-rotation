// ============================================================
// SETUP TRIGGERS
// ============================================================

function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }

  const weekDays = [
    ScriptApp.WeekDay.SUNDAY,
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY,
    ScriptApp.WeekDay.SATURDAY
  ];

  ScriptApp.newTrigger("maintainRotation")
    .timeBased()
    .onWeekDay(weekDays[CONFIG.MAINTENANCE_ROTATION_DAY])
    .atHour(CONFIG.MAINTENANCE_ARCHIVE_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  ScriptApp.newTrigger("sendMaintenanceHandoverNotification")
    .timeBased()
    .onWeekDay(weekDays[CONFIG.MAINTENANCE_ROTATION_DAY])
    .atHour(CONFIG.MAINTENANCE_START_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  ScriptApp.newTrigger("sendReminderNotification")
    .timeBased()
    .onWeekDay(weekDays[CONFIG.REMINDER_DAY])
    .atHour(CONFIG.REMINDER_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log(`✓ Triggers set up`);
  Logger.log(`  - Maintenance handover: ${CONFIG.getDayName(CONFIG.MAINTENANCE_ROTATION_DAY)} at ${CONFIG.MAINTENANCE_START_HOUR}:00`);
  Logger.log(`  - Change notification: ${CONFIG.getDayName(CONFIG.REMINDER_DAY)} at ${CONFIG.REMINDER_HOUR}:00`);
}