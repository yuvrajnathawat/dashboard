'use strict';

const cron = require('node-cron');
const pool = require('../config/database');
const pterodactylService = require('./pterodactylService');
const discordService = require('./discordService');

/**
 * Fetch a single setting value from the database.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getSetting(key) {
  const [rows] = await pool.query('SELECT value FROM settings WHERE key = ?', [key]);
  return rows.length ? rows[0].value : null;
}

/**
 * Start the expiry cron job (runs every 15 minutes).
 *
 * Step 1 — Suspend active servers that have passed their expiry date.
 * Step 2 — Delete suspended servers that have exceeded the deletion grace period.
 */
function startExpiryJob() {
  cron.schedule('*/15 * * * *', async () => {
    // ── Step 1: Suspend expired active servers ────────────────────────────────
    try {
      const [expiredServers] = await pool.query(
        `SELECT s.*, u.discord_id
         FROM servers s
         JOIN users u ON s.user_id = u.id
         WHERE s.status = 'active' AND s.expires_at < NOW()`
      );

      for (const server of expiredServers) {
        try {
          await pterodactylService.suspendServer(server.ptero_server_id);

          await pool.query('UPDATE servers SET status = ? WHERE id = ?', [
            'suspended',
            server.id,
          ]);

          if (process.env.DISCORD_BOT_TOKEN && server.discord_id) {
            await discordService.sendDM(
              server.discord_id,
              `⚠️ Your server **${server.name}** has been suspended because it expired. ` +
                `Please renew it to restore access.`
            );
          }
        } catch (err) {
          console.error(
            `[expiryService] Failed to suspend server id=${server.id}:`,
            err.message
          );
          // Continue processing remaining servers
        }
      }
    } catch (err) {
      console.error('[expiryService] Error querying expired active servers:', err.message);
    }

    // ── Step 2: Delete suspended servers past the grace period ────────────────
    try {
      const deletionGraceDays = parseInt(await getSetting('deletion_grace_days'), 10) || 7;

      const [staleServers] = await pool.query(
        `SELECT * FROM servers
         WHERE status = 'suspended'
           AND expires_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [deletionGraceDays]
      );

      for (const server of staleServers) {
        try {
          await pterodactylService.deleteServer(server.ptero_server_id);

          await pool.query('DELETE FROM servers WHERE id = ?', [server.id]);
        } catch (err) {
          console.error(
            `[expiryService] Failed to delete server id=${server.id}:`,
            err.message
          );
          // Continue processing remaining servers
        }
      }
    } catch (err) {
      console.error('[expiryService] Error querying stale suspended servers:', err.message);
    }
  });
}

module.exports = { startExpiryJob };
