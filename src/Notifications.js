// ============================================================
// SLACK CHANNEL
// ============================================================

function getSlackChannel() {
  return getConfig().SLACK_CHANNEL;
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
  const config = getConfig();
  const today = DateUtils.getTodayAtMidnight();

  if (today.getDay() !== config.REMINDER_DAY) {
    Logger.log(`Today is not ${DAY_NAMES[config.REMINDER_DAY]}, skipping notification`);
    return;
  }

  const slackToken = getSlackToken();
  const slackChannel = getSlackChannel();

  if (!slackToken || !slackChannel) {
    throw new Error("Slack token or channel not configured - reminder not sent");
  }

  const daysUntilRotation = (config.ROTATION_DAY - today.getDay() + 7) % 7;
  const nextRotationDay = DateUtils.addDays(today, daysUntilRotation);

  const assignment = findAssignmentByStartDate(nextRotationDay);

  if (!assignment) {
    Logger.log(`No assignment found for next ${DAY_NAMES[config.ROTATION_DAY]}`);
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
  d.setHours(getConfig().ROTATION_START_HOUR, 0, 0, 0);
  const datePart = Utilities.formatDate(d, getTimeZone(), "EEE, MMM d, yyyy");
  return `${datePart}, ${formatStartTime(d)}`;
}

function formatStartTime(date) {
  const d = new Date(date);
  d.setHours(getConfig().ROTATION_START_HOUR, 0, 0, 0);
  return `${getConfig().ROTATION_START_HOUR}:00 ${Utilities.formatDate(d, getTimeZone(), "z")}`;
}

function getDurationText() {
  const days = getConfig().DAYS_IN_MAINTENANCE;
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return `${days} days`;
}

function buildHandoverMessage(prevBackend, newBackend, prevFrontend, newFrontend, newAssignment) {
  const handoverStart = formatHandoverMoment(newAssignment.startDate);
  const handoverEnd = formatHandoverMoment(DateUtils.addDays(new Date(newAssignment.endDate), 1));

  return {
    text: MESSAGES.HANDOVER_HEADER,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: MESSAGES.HANDOVER_HEADER, emoji: true }
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
          text: `:calendar: *Maintenance Period:* ${getDurationText()}\n${handoverStart}  →  ${handoverEnd}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${MESSAGES.HANDOVER_DESCRIPTION}\n${MESSAGES.HANDOVER_OUTGOING}\n${MESSAGES.HANDOVER_INCOMING}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: MESSAGES.HANDOVER_NEXT_STEPS.replace("{BUGS_CHANNEL_ID}", getConfig().BUGS_CHANNEL_ID)
        }
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: MESSAGES.HANDOVER_NOTE }
        ]
      }
    ]
  };
}

function buildChangeNotificationMessage(prevBackend, newBackend, prevFrontend, newFrontend, rotationDate) {
  const prepareMsg = MESSAGES.CHANGES_PREPARE.replace(
    "{TIME}",
    formatStartTime(rotationDate)
  );

  return {
    text: MESSAGES.CHANGES_HEADER,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: MESSAGES.CHANGES_HEADER }
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
          text: `:alarm_clock: ${prepareMsg}\n:calendar: ${MESSAGES.CHANGES_CHECK}`
        }
      }
    ]
  };
}
