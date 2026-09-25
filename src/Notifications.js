// ============================================================
// SLACK CHANNEL
// ============================================================

function getSlackChannel() {
  return CONFIG.SLACK_CHANNEL_NOTIFICATIONS;
}

// ============================================================
// ROTATION DAY NOTIFICATIONS
// ============================================================

function sendMaintenanceHandoverNotification() {
  const today = DateUtils.getTodayAtMidnight();
  const newAssignment = findAssignmentByStartDate(today);

  if (!newAssignment) {
    Logger.log("No assignment found for today");
    return;
  }

  if (newAssignment.notified === "TRUE") {
    Logger.log("Notification already sent for today");
    return;
  }

  const yesterday = DateUtils.subtractDays(today, 1);
  const previousAssignment = findPreviousAssignment(yesterday);

  notifyHandover(newAssignment, previousAssignment);
  markAssignmentAsNotified(newAssignment.rowIndex);
}

function notifyHandover(newAssignment, previousAssignment) {
  const slackToken = getSlackToken();
  const slackChannel = getSlackChannel();

  if (!slackToken || !slackChannel) {
    Logger.log("Slack configuration not found");
    return;
  }

  if (!previousAssignment) {
    Logger.log("No previous assignment found - skipping handover notification");
    return;
  }

  const engineers = getEngineersData();

  const newBackendId = engineers.userIds[newAssignment.backend] || newAssignment.backend;
  const newFrontendId = engineers.userIds[newAssignment.frontend] || newAssignment.frontend;
  const prevBackendId = engineers.userIds[previousAssignment.backend] || previousAssignment.backend;
  const prevFrontendId = engineers.userIds[previousAssignment.frontend] || previousAssignment.frontend;

  const message = buildHandoverMessage(
    prevBackendId, newBackendId,
    prevFrontendId, newFrontendId,
    newAssignment
  );

  SlackAPI.sendMessage(slackToken, slackChannel, message);
  Logger.log(`✓ Sent handover notification`);
}

// ============================================================
// REMINDER NOTIFICATIONS
// ============================================================

function sendReminderNotification() {
  const today = DateUtils.getTodayAtMidnight();

  if (today.getDay() !== CONFIG.REMINDER_DAY) {
    Logger.log(`Today is not ${CONFIG.getDayName(CONFIG.REMINDER_DAY)}, skipping notification`);
    return;
  }

  const slackToken = getSlackToken();
  const slackChannel = getSlackChannel();

  if (!slackToken || !slackChannel) {
    Logger.log("Slack configuration not found");
    return;
  }

  const daysUntilRotation = (CONFIG.MAINTENANCE_ROTATION_DAY - today.getDay() + 7) % 7;
  const nextRotationDay = DateUtils.addDays(today, daysUntilRotation);

  const assignment = findAssignmentByStartDate(nextRotationDay);

  if (!assignment) {
    Logger.log(`No assignment found for next ${CONFIG.getDayName(CONFIG.MAINTENANCE_ROTATION_DAY)}`);
    return;
  }

  if (assignment.reminderSent === "TRUE") {
    Logger.log("Reminder already sent for this rotation");
    return;
  }

  const prevAssignment = findPreviousAssignment(DateUtils.subtractDays(nextRotationDay, 1));

  if (!prevAssignment) {
    Logger.log("No previous assignment found - skipping reminder");
    return;
  }

  const engineers = getEngineersData();

  const backendId = engineers.userIds[assignment.backend] || assignment.backend;
  const frontendId = engineers.userIds[assignment.frontend] || assignment.frontend;
  const prevBackendId = engineers.userIds[prevAssignment.backend] || prevAssignment.backend;
  const prevFrontendId = engineers.userIds[prevAssignment.frontend] || prevAssignment.frontend;

  const message = buildChangeNotificationMessage(
    prevBackendId, backendId,
    prevFrontendId, frontendId,
    nextRotationDay
  );

  SlackAPI.sendMessage(slackToken, slackChannel, message);
  markAssignmentReminderAsSent(assignment.rowIndex);
  Logger.log(`✓ Sent change notification for next rotation`);
}

// ============================================================
// MESSAGE BUILDERS
// ============================================================

function formatHandoverMoment(date) {
  const d = new Date(date);
  d.setHours(CONFIG.MAINTENANCE_START_HOUR, 0, 0, 0);
  const datePart = Utilities.formatDate(d, CONFIG.TIMEZONE, "EEE, MMM d, yyyy");
  const tz = Utilities.formatDate(d, CONFIG.TIMEZONE, "z");
  return `${datePart}, ${CONFIG.MAINTENANCE_START_HOUR}:00 ${tz}`;
}

function buildHandoverMessage(prevBackendId, newBackendId, prevFrontendId, newFrontendId, newAssignment) {
  const handoverStart = formatHandoverMoment(newAssignment.startDate);
  const handoverEnd = formatHandoverMoment(DateUtils.addDays(new Date(newAssignment.endDate), 1));

  return {
    text: CONFIG.MESSAGES.HANDOVER_HEADER,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: CONFIG.MESSAGES.HANDOVER_HEADER, emoji: true }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *Backend:* <@${prevBackendId}> → <@${newBackendId}>\n• *Frontend:* <@${prevFrontendId}> → <@${newFrontendId}>`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:calendar: *Maintenance Period:* ${CONFIG.getDurationText()}\n${handoverStart}  →  ${handoverEnd}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${CONFIG.MESSAGES.HANDOVER_DESCRIPTION}\n${CONFIG.MESSAGES.HANDOVER_OUTGOING}\n${CONFIG.MESSAGES.HANDOVER_INCOMING}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: CONFIG.MESSAGES.HANDOVER_NEXT_STEPS.replace("{BUGS_CHANNEL_ID}", CONFIG.BUGS_CHANNEL_ID)
        }
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: CONFIG.MESSAGES.HANDOVER_NOTE }
        ]
      }
    ]
  };
}

function buildChangeNotificationMessage(prevBackendId, newBackendId, prevFrontendId, newFrontendId, rotationDate) {
  const prepareMsg = CONFIG.MESSAGES.CHANGES_PREPARE.replace(
    "{TIME}",
    CONFIG.getMaintenanceStartTimeDisplay(rotationDate)
  );

  return {
    text: CONFIG.MESSAGES.CHANGES_HEADER,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: CONFIG.MESSAGES.CHANGES_HEADER }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *Backend:* <@${prevBackendId}> → <@${newBackendId}>\n• *Frontend:* <@${prevFrontendId}> → <@${newFrontendId}>`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:alarm_clock: ${prepareMsg}\n:calendar: ${CONFIG.MESSAGES.CHANGES_CHECK}`
        }
      }
    ]
  };
}
