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

  if (isFlagSet(newAssignment.notified)) {
    Logger.log("Notification already sent for today");
    return;
  }

  const yesterday = DateUtils.subtractDays(today, 1);
  const previousAssignment = findPreviousAssignment(yesterday);

  // Throws if the message wasn't delivered, so the flag is only set on success
  notifyHandover(newAssignment, previousAssignment);
  markAssignmentAsNotified(newAssignment.rowIndex);
}

function notifyHandover(newAssignment, previousAssignment) {
  const slackToken = getSlackToken();
  const slackChannel = getSlackChannel();

  if (!slackToken || !slackChannel) {
    throw new Error("Slack token or channel not configured - handover notification not sent");
  }

  if (!previousAssignment) {
    Logger.log("⚠️ No previous assignment found - sending handover with the incoming pair only");
  }

  const engineers = getEngineersData();
  const prev = previousAssignment || {};

  const message = buildHandoverMessage(
    formatMention(prev.backend, engineers.userIds), formatMention(newAssignment.backend, engineers.userIds),
    formatMention(prev.frontend, engineers.userIds), formatMention(newAssignment.frontend, engineers.userIds),
    newAssignment
  );

  sendSlackMessageOrThrow(slackToken, slackChannel, message, "handover notification");
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
    throw new Error("Slack token or channel not configured - reminder not sent");
  }

  const daysUntilRotation = (CONFIG.MAINTENANCE_ROTATION_DAY - today.getDay() + 7) % 7;
  const nextRotationDay = DateUtils.addDays(today, daysUntilRotation);

  const assignment = findAssignmentByStartDate(nextRotationDay);

  if (!assignment) {
    Logger.log(`No assignment found for next ${CONFIG.getDayName(CONFIG.MAINTENANCE_ROTATION_DAY)}`);
    return;
  }

  if (isFlagSet(assignment.reminderSent)) {
    Logger.log("Reminder already sent for this rotation");
    return;
  }

  const prevAssignment = findPreviousAssignment(DateUtils.subtractDays(nextRotationDay, 1));

  if (!prevAssignment) {
    Logger.log("⚠️ No previous assignment found - sending reminder with the incoming pair only");
  }

  const engineers = getEngineersData();
  const prev = prevAssignment || {};

  const message = buildChangeNotificationMessage(
    formatMention(prev.backend, engineers.userIds), formatMention(assignment.backend, engineers.userIds),
    formatMention(prev.frontend, engineers.userIds), formatMention(assignment.frontend, engineers.userIds),
    nextRotationDay
  );

  sendSlackMessageOrThrow(slackToken, slackChannel, message, "reminder");
  markAssignmentReminderAsSent(assignment.rowIndex);
  Logger.log(`✓ Sent change notification for next rotation`);
}

// ============================================================
// SLACK HELPERS
// ============================================================

function sendSlackMessageOrThrow(token, channel, message, description) {
  const result = SlackAPI.sendMessage(token, channel, message);
  if (!result || !result.ok) {
    throw new Error(`Slack ${description} failed: ${result ? result.error : "no response"}`);
  }
  return result;
}

function formatMention(name, userIds) {
  if (!name) return null;
  const userId = userIds[name];
  if (!userId) {
    Logger.log(`⚠️ No Slack User ID for "${name}" - showing the name without a mention`);
    return name;
  }
  return `<@${userId}>`;
}

function formatPairLine(label, previous, next) {
  return previous ? `• *${label}:* ${previous} → ${next}` : `• *${label}:* ${next}`;
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

function buildHandoverMessage(prevBackend, newBackend, prevFrontend, newFrontend, newAssignment) {
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
          text: `${formatPairLine("Backend", prevBackend, newBackend)}\n${formatPairLine("Frontend", prevFrontend, newFrontend)}`
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

function buildChangeNotificationMessage(prevBackend, newBackend, prevFrontend, newFrontend, rotationDate) {
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
          text: `${formatPairLine("Backend", prevBackend, newBackend)}\n${formatPairLine("Frontend", prevFrontend, newFrontend)}`
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
