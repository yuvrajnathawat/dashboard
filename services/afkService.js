'use strict';

const pool = require('../config/database');
const coinService = require('./coinService');

/**
 * Fetch a numeric setting from the settings table.
 * @param {string} key
 * @returns {Promise<number>}
 */
async function getSetting(key) {
  const [rows] = await pool.execute(
    'SELECT value FROM settings WHERE `key` = ?',
    [key]
  );
  return parseInt(rows[0].value, 10);
}

/**
 * Handle an AFK ping for a user.
 * @param {number} userId
 * @param {object} session - Express session object
 * @returns {Promise<{awarded: number, balance: number, limitReached?: boolean, captchaRequired?: boolean}>}
 */
async function handlePing(userId, session) {
  const afkDailyLimit = await getSetting('afk_daily_limit');
  const afkCoinsPerPing = await getSetting('afk_coins_per_ping');
  const afkCaptchaIntervalMinutes = await getSetting('afk_captcha_interval_minutes');

  // Sum today's AFK earnings
  const [rows] = await pool.execute(
    "SELECT SUM(ABS(amount)) AS earned FROM coin_transactions WHERE user_id = ? AND reason = 'afk' AND DATE(created_at) = CURDATE()",
    [userId]
  );
  const earnedToday = Number(rows[0].earned) || 0;

  // Check daily limit
  if (earnedToday >= afkDailyLimit) {
    const currentBalance = await coinService.getBalance(userId);
    return { awarded: 0, balance: currentBalance, limitReached: true };
  }

  // Check if captcha is already required
  if (session.afkCaptchaRequired) {
    const currentBalance = await coinService.getBalance(userId);
    return { awarded: 0, balance: currentBalance, captchaRequired: true };
  }

  // Check captcha interval
  if (session.afkSessionStart) {
    const elapsed = Date.now() - session.afkSessionStart;
    if (elapsed > afkCaptchaIntervalMinutes * 60 * 1000) {
      session.afkCaptchaRequired = true;
      return { awarded: 0, captchaRequired: true };
    }
  } else {
    // First ping — start the session timer
    session.afkSessionStart = Date.now();
  }

  // Award coins
  const newBalance = await coinService.credit(userId, afkCoinsPerPing, 'afk');
  return { awarded: afkCoinsPerPing, balance: newBalance, captchaRequired: false };
}

/**
 * Verify a CAPTCHA solve and reset the AFK session.
 * @param {number} userId
 * @param {object} session - Express session object
 * @returns {{ success: boolean }}
 */
function verifyCaptcha(userId, session) {
  session.afkCaptchaRequired = false;
  session.afkSessionStart = Date.now();
  return { success: true };
}

module.exports = { handlePing, verifyCaptcha };
