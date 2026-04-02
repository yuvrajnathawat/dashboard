'use strict';

const pool = require('../config/database');
const coinService = require('./coinService');

/**
 * Get all active earn links for a user, with cooldown status.
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function getLinksForUser(userId) {
  const [links] = await pool.execute(
    'SELECT * FROM earn_links WHERE is_active = 1'
  );

  const now = Date.now();

  return Promise.all(
    links.map(async (link) => {
      const [rows] = await pool.execute(
        'SELECT created_at FROM earn_completions WHERE user_id = ? AND link_id = ? ORDER BY created_at DESC LIMIT 1',
        [userId, link.id]
      );

      if (!rows.length) {
        return { ...link, onCooldown: false, cooldownRemainingSeconds: 0 };
      }

      const lastCompletedAt = new Date(rows[0].created_at).getTime();
      const cooldownEndsAt = lastCompletedAt + link.cooldown_seconds * 1000;
      const remaining = cooldownEndsAt - now;

      if (remaining > 0) {
        return { ...link, onCooldown: true, cooldownRemainingSeconds: Math.ceil(remaining / 1000) };
      }

      return { ...link, onCooldown: false, cooldownRemainingSeconds: 0 };
    })
  );
}

/**
 * Start an earn flow for a user.
 * @param {number} userId
 * @param {number} linkId
 * @param {object} session - Express session object
 * @returns {Promise<{url: string}>}
 */
async function startEarn(userId, linkId, session) {
  const [links] = await pool.execute(
    'SELECT * FROM earn_links WHERE id = ? AND is_active = 1',
    [linkId]
  );

  if (!links.length) {
    throw new Error('Link not found');
  }

  const link = links[0];
  const now = Date.now();

  const [rows] = await pool.execute(
    'SELECT created_at FROM earn_completions WHERE user_id = ? AND link_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId, link.id]
  );

  if (rows.length) {
    const lastCompletedAt = new Date(rows[0].created_at).getTime();
    const cooldownEndsAt = lastCompletedAt + link.cooldown_seconds * 1000;
    const remaining = cooldownEndsAt - now;

    if (remaining > 0) {
      const err = new Error('Link is on cooldown');
      err.cooldownRemainingSeconds = Math.ceil(remaining / 1000);
      throw err;
    }
  }

  session.earnPending = { linkId: link.id, startedAt: Date.now() };

  return { url: link.url };
}

/**
 * Verify an earn completion for a user.
 * @param {number} userId
 * @param {number} linkId
 * @param {object} session - Express session object
 * @returns {Promise<{awarded: number, balance: number}>}
 */
async function verifyEarn(userId, linkId, session) {
  const FIVE_MINUTES = 5 * 60 * 1000;
  const pending = session.earnPending;

  if (
    !pending ||
    // eslint-disable-next-line eqeqeq
    pending.linkId != linkId ||
    Date.now() - pending.startedAt > FIVE_MINUTES
  ) {
    throw new Error('Invalid verification');
  }

  const [links] = await pool.execute(
    'SELECT * FROM earn_links WHERE id = ? AND is_active = 1',
    [linkId]
  );

  if (!links.length) {
    throw new Error('Link not found');
  }

  const link = links[0];
  const now = Date.now();

  const [rows] = await pool.execute(
    'SELECT created_at FROM earn_completions WHERE user_id = ? AND link_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId, link.id]
  );

  if (rows.length) {
    const lastCompletedAt = new Date(rows[0].created_at).getTime();
    const cooldownEndsAt = lastCompletedAt + link.cooldown_seconds * 1000;
    const remaining = cooldownEndsAt - now;

    if (remaining > 0) {
      const err = new Error('Link is on cooldown');
      err.cooldownRemainingSeconds = Math.ceil(remaining / 1000);
      throw err;
    }
  }

  const newBalance = await coinService.credit(userId, link.coin_reward, 'earn_link');

  await pool.execute(
    'INSERT INTO earn_completions (user_id, link_id) VALUES (?, ?)',
    [userId, link.id]
  );

  session.earnPending = null;

  return { awarded: link.coin_reward, balance: newBalance };
}

module.exports = { getLinksForUser, startEarn, verifyEarn };
