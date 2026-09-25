// ============================================================
// SLACK API - Reusable across scripts
// ============================================================

const SlackAPI = {
  
  // ============================================================
  // USERS
  // ============================================================
  
  getUserId(token, displayName) {
    if (!token || !displayName) {
      Logger.log("Error: token or displayName missing");
      return displayName;
    }
    
    const url = "https://slack.com/api/users.list";
    const options = {
      method: "get",
      headers: { "Authorization": `Bearer ${token}` },
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());
      
      if (!json.ok) {
        Logger.log(`Slack API Error (users.list): ${json.error}`);
        return displayName;
      }
      
      const user = this._findUserByName(json.members, displayName);
      if (user) {
        return user.id;
      }
      
      Logger.log(`Warning: Could not find Slack user: ${displayName}`);
      return displayName;
    } catch (e) {
      Logger.log(`Exception in getUserId: ${e.message}`);
      return displayName;
    }
  },
  
  _findUserByName(members, displayName) {
    for (const user of members) {
      if (user.deleted) continue; // Skip deleted users
      
      const profile = user.profile || {};
      
      // Match by display name (first priority)
      if (profile.display_name && profile.display_name.toLowerCase() === displayName.toLowerCase()) {
        return user;
      }
      
      // Match by real name
      if (profile.real_name && profile.real_name.toLowerCase() === displayName.toLowerCase()) {
        return user;
      }
      
      // Match by real_name field
      if (user.real_name && user.real_name.toLowerCase() === displayName.toLowerCase()) {
        return user;
      }
      
      // Match by name field
      if (user.name && user.name.toLowerCase() === displayName.toLowerCase()) {
        return user;
      }
    }
    
    return null;
  },
  
  // ============================================================
  // MESSAGES
  // ============================================================
  
  sendMessage(token, channel, message) {
    if (!token || !channel || !message) {
      Logger.log("Error: token, channel, or message missing");
      return { ok: false, error: "Missing parameters" };
    }
    
    const url = "https://slack.com/api/chat.postMessage";
    const payload = JSON.stringify({
      channel: channel,
      ...message
    });
    
    const options = {
      method: "post",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());
      
      if (!json.ok) {
        Logger.log(`Slack API Error (chat.postMessage): ${json.error}`);
        return json;
      }
      
      Logger.log(`Message sent to ${channel}`);
      return json;
    } catch (e) {
      Logger.log(`Exception in sendMessage: ${e.message}`);
      return { ok: false, error: e.message };
    }
  },
  
  sendDM(token, userId, message) {
    if (!token || !userId || !message) {
      Logger.log("Error: token, userId, or message missing");
      return { ok: false, error: "Missing parameters" };
    }
    
    // First, open a DM channel
    const channelId = this._openDMChannel(token, userId);
    if (!channelId) {
      Logger.log(`Failed to open DM with user ${userId}`);
      return { ok: false, error: "Failed to open DM channel" };
    }
    
    // Then send the message
    return this.sendMessage(token, channelId, message);
  },
  
  _openDMChannel(token, userId) {
    const url = "https://slack.com/api/conversations.open";
    const payload = JSON.stringify({ users: userId });
    
    const options = {
      method: "post",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());
      
      if (!json.ok) {
        Logger.log(`Slack API Error (conversations.open): ${json.error}`);
        return null;
      }
      
      return json.channel.id;
    } catch (e) {
      Logger.log(`Exception in _openDMChannel: ${e.message}`);
      return null;
    }
  },
  
  // ============================================================
  // REACTIONS
  // ============================================================
  
  addReaction(token, emoji, channel, timestamp) {
    if (!token || !emoji || !channel || !timestamp) {
      Logger.log("Error: Missing required parameters");
      return { ok: false, error: "Missing parameters" };
    }
    
    const url = "https://slack.com/api/reactions.add";
    const payload = JSON.stringify({
      name: emoji,
      channel: channel,
      timestamp: timestamp
    });
    
    const options = {
      method: "post",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());
      
      if (!json.ok) {
        Logger.log(`Slack API Error (reactions.add): ${json.error}`);
        return json;
      }
      
      return json;
    } catch (e) {
      Logger.log(`Exception in addReaction: ${e.message}`);
      return { ok: false, error: e.message };
    }
  },
  
  // ============================================================
  // CHANNELS
  // ============================================================
  
  getChannelInfo(token, channelId) {
    if (!token || !channelId) {
      Logger.log("Error: token or channelId missing");
      return null;
    }
    
    const url = "https://slack.com/api/conversations.info";
    const options = {
      method: "get",
      headers: { "Authorization": `Bearer ${token}` },
      muteHttpExceptions: true,
      payload: {
        channel: channelId
      }
    };
    
    try {
      const response = UrlFetchApp.fetch(url + `?channel=${channelId}`, options);
      const json = JSON.parse(response.getContentText());
      
      if (!json.ok) {
        Logger.log(`Slack API Error (conversations.info): ${json.error}`);
        return null;
      }
      
      return json.channel;
    } catch (e) {
      Logger.log(`Exception in getChannelInfo: ${e.message}`);
      return null;
    }
  },
  
  // ============================================================
  // UTILITY
  // ============================================================
  
  testConnection(token) {
    if (!token) {
      Logger.log("Error: token missing");
      return false;
    }
    
    const url = "https://slack.com/api/auth.test";
    const options = {
      method: "post",
      headers: { "Authorization": `Bearer ${token}` },
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());
      
      if (json.ok) {
        Logger.log(`✓ Slack connection successful. User: ${json.user_id}, Team: ${json.team_id}`);
        return true;
      } else {
        Logger.log(`Slack connection failed: ${json.error}`);
        return false;
      }
    } catch (e) {
      Logger.log(`Exception in testConnection: ${e.message}`);
      return false;
    }
  }
};