'use strict';

const axios = require('axios');

/**
 * Send a Discord DM to a user via the Discord REST API.
 * Fire-and-forget: errors are logged but never thrown.
 *
 * @param {string} discordUserId - The recipient's Discord user ID (snowflake)
 * @param {string} message       - The message content to send
 */
async function sendDM(discordUserId, message) {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.warn('[discordService] DISCORD_BOT_TOKEN is not set — skipping DM');
    return;
  }

  try {
    const headers = {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    };

    // Step 1: Open (or retrieve) a DM channel with the user
    const channelRes = await axios.post(
      'https://discord.com/api/v10/users/@me/channels',
      { recipient_id: discordUserId },
      { headers }
    );

    const channelId = channelRes.data.id;

    // Step 2: Send the message to that DM channel
    await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      { content: message },
      { headers }
    );
  } catch (err) {
    console.error(
      `[discordService] Failed to send DM to user ${discordUserId}:`,
      err.response ? err.response.data : err.message
    );
  }
}

module.exports = { sendDM };
