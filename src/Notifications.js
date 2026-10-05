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
  } else {
    const yesterday = DateUtils.subtractDays(today, 1);
    const previousAssignment = findPreviousAssignment(yesterday);

    // Throws if the message wasn't delivered, so the flag is only set on success
    notifyHandover(newAssignment, previousAssignment);
    markAssignmentAsNotified(newAssignment.rowIndex);
  }

  // After the handover, so a topic failure never holds it back. Re-running
  // retries the topic without posting the handover again.
  updateChannelTopic(newAssignment);
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

  const message = composeHandoverMessage(newAssignment, previousAssignment, true);
  sendSlackMessageOrThrow(slackToken, slackChannel, message, "handover notification");
  Logger.log(`✓ Sent handover notification`);
}

// ============================================================
// CHANNEL TOPIC
// ============================================================

// Returns the topic that was set, or null when the topic is disabled
function updateChannelTopic(assignment) {
  const channelId = getConfig().TOPIC_CHANNEL_ID;
  const topic = composeChannelTopic(assignment, true);

  if (!channelId || !topic) {
    Logger.log("TOPIC_CHANNEL_ID or CHANNEL_TOPIC is empty - channel topic left alone");
    return null;
  }

  const slackToken = getSlackToken();
  if (!slackToken) {
    throw new Error("Slack token not configured - channel topic not updated");
  }

  const channel = SlackAPI.getChannelInfo(slackToken, channelId);
  if (channel && channel.topic && channel.topic.value === topic) {
    Logger.log("Channel topic already up to date");
    return topic;
  }

  const result = SlackAPI.setTopic(slackToken, channelId, topic);
  if (!result || !result.ok) {
    const scopes = result && result.error === "missing_scope"
      ? ` (needs ${result.needed}, token has ${result.provided})`
      : "";
    throw new Error(`Slack channel topic update failed: ${result ? result.error : "no response"}${scopes}`);
  }

  Logger.log(`✓ Channel topic set to: ${topic}`);
  return topic;
}

function composeChannelTopic(assignment, useMentions) {
  const [, newBackend, , newFrontend] = formatPeople(assignment, null, useMentions);
  return renderMessage("CHANNEL_TOPIC", buildMessageValues(null, newBackend, null, newFrontend, assignment));
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

  const message = composeReminderMessage(assignment, prevAssignment, true);
  sendSlackMessageOrThrow(slackToken, slackChannel, message, "reminder");
  markAssignmentReminderAsSent(assignment.rowIndex);
  Logger.log(`✓ Sent change notification for next rotation`);
}

function composeHandoverMessage(assignment, previousAssignment, useMentions) {
  return buildHandoverMessage(...formatPeople(assignment, previousAssignment, useMentions), assignment);
}

function composeReminderMessage(assignment, previousAssignment, useMentions) {
  return buildChangeNotificationMessage(...formatPeople(assignment, previousAssignment, useMentions), assignment);
}

function formatPeople(assignment, previousAssignment, useMentions) {
  const previous = previousAssignment || {};
  const userIds = useMentions ? getEngineersData().userIds : null;
  const show = name => (useMentions ? formatMention(name, userIds) : name || null);
  return [show(previous.backend), show(assignment.backend), show(previous.frontend), show(assignment.frontend)];
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

// ============================================================
// MESSAGE BUILDERS
// ============================================================

function formatHandoverMoment(date) {
  const d = new Date(date);
  d.setHours(getConfig().ROTATION_START_HOUR, 0, 0, 0);
  const datePart = Utilities.formatDate(d, getTimeZone(), "EEE, MMM d, yyyy");
  return `${datePart}, ${formatStartTime(d)}`;
}

function formatShortDate(date) {
  return Utilities.formatDate(new Date(date), getTimeZone(), "MMM d");
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

function buildMessageValues(prevBackend, newBackend, prevFrontend, newFrontend, assignment) {
  const config = getConfig();
  const pair = (previous, next) => (previous ? `${previous} → ${next}` : next);

  return {
    BACKEND: pair(prevBackend, newBackend),
    FRONTEND: pair(prevFrontend, newFrontend),
    NEW_BACKEND: newBackend,
    NEW_FRONTEND: newFrontend,
    PREV_BACKEND: prevBackend || "",
    PREV_FRONTEND: prevFrontend || "",
    START: formatHandoverMoment(assignment.startDate),
    END: formatHandoverMoment(DateUtils.addDays(new Date(assignment.endDate), 1)),
    START_DATE: formatShortDate(assignment.startDate),
    END_DATE: formatShortDate(DateUtils.addDays(new Date(assignment.endDate), 1)),
    DAY: DAY_NAMES[config.ROTATION_DAY],
    TIME: formatStartTime(assignment.startDate),
    DURATION: getDurationText(),
    BUGS_CHANNEL: config.BUGS_CHANNEL_ID ? `<#${config.BUGS_CHANNEL_ID}>` : "",
    TEAM_NAME: config.TEAM_NAME
  };
}

function buildSlackMessage(parts, values) {
  const blocks = [];
  let fallbackText = "Maintenance rotation update";

  for (const [type, key] of parts) {
    const text = renderMessage(key, values);
    if (!text) continue;

    if (type === "header") {
      fallbackText = text;
      blocks.push({ type: "header", text: { type: "plain_text", text, emoji: true } });
    } else if (type === "context") {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text }] });
    } else {
      blocks.push({ type: "section", text: { type: "mrkdwn", text } });
    }
  }

  return { text: fallbackText, blocks };
}

function buildHandoverMessage(prevBackend, newBackend, prevFrontend, newFrontend, newAssignment) {
  return buildSlackMessage([
    ["header", "HANDOVER_HEADER"],
    ["section", "HANDOVER_ASSIGNMENTS"],
    ["section", "HANDOVER_PERIOD"],
    ["section", "HANDOVER_INSTRUCTIONS"],
    ["section", "HANDOVER_NEXT_STEPS"],
    ["context", "HANDOVER_NOTE"]
  ], buildMessageValues(prevBackend, newBackend, prevFrontend, newFrontend, newAssignment));
}

function buildChangeNotificationMessage(prevBackend, newBackend, prevFrontend, newFrontend, assignment) {
  return buildSlackMessage([
    ["header", "REMINDER_HEADER"],
    ["section", "REMINDER_ASSIGNMENTS"],
    ["section", "REMINDER_BODY"]
  ], buildMessageValues(prevBackend, newBackend, prevFrontend, newFrontend, assignment));
}
