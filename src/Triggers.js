// ============================================================
// SETUP TRIGGERS
// ============================================================

function setupTriggers() {
  const config = getConfig();
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
    .onWeekDay(weekDays[config.ROTATION_DAY])
    .atHour(config.ARCHIVE_HOUR)
    .inTimezone(getTimeZone())
    .create();

  ScriptApp.newTrigger("sendMaintenanceHandoverNotification")
    .timeBased()
    .onWeekDay(weekDays[config.ROTATION_DAY])
    .atHour(config.ROTATION_START_HOUR)
    .inTimezone(getTimeZone())
    .create();

  ScriptApp.newTrigger("sendReminderNotification")
    .timeBased()
    .onWeekDay(weekDays[config.REMINDER_DAY])
    .atHour(config.REMINDER_HOUR)
    .inTimezone(getTimeZone())
    .create();

  Logger.log(`✓ Triggers set up`);
  Logger.log(`  - Maintenance handover: ${DAY_NAMES[config.ROTATION_DAY]} at ${config.ROTATION_START_HOUR}:00`);
  Logger.log(`  - Change notification: ${DAY_NAMES[config.REMINDER_DAY]} at ${config.REMINDER_HOUR}:00`);
}