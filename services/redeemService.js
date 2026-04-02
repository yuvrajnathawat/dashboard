'use strict';

const pool = require('../config/database');

/**
 * Redeem a code for a user.
 * @param {number} userId
 * @param {string} code
 * @returns {Promise<{coins: number, bonuses: object|null}>}
 */
async function redeem(userId, code) {
  // 1. Look up code case-insensitively
  const [codes] = await pool.execute(
    'SELECT * FROM redeem_codes WHERE UPPER(code) = UPPER(?)',
    [code]
  );

  if (!codes.length) {
    throw new Error('Invalid code');
  }

  const redeemCode = codes[0];

  // 2. Check expiry
  if (redeemCode.expires_at !== null && new Date(redeemCode.expires_at) < new Date()) {
    throw new Error('Code has expired');
  }

  // 3. Check max uses
  if (redeemCode.max_uses !== null && redeemCode.use_count >= redeemCode.max_uses) {
    throw new Error('Code has been fully redeemed');
  }

  // 4. Check if user already redeemed
  const [uses] = await pool.execute(
    'SELECT * FROM redeem_uses WHERE user_id = ? AND code_id = ?',
    [userId, redeemCode.id]
  );

  if (uses.length) {
    throw new Error('You have already redeemed this code');
  }

  // 5. Execute transaction
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Credit coins
    await conn.execute(
      'UPDATE users SET coins = coins + ? WHERE id = ?',
      [redeemCode.coin_reward, userId]
    );

    // Record coin transaction
    await conn.execute(
      'INSERT INTO coin_transactions (user_id, amount, reason) VALUES (?, ?, ?)',
      [userId, redeemCode.coin_reward, 'redeem']
    );

    // Apply resource bonuses if present
    if (redeemCode.resource_bonuses) {
      const bonuses = typeof redeemCode.resource_bonuses === 'string'
        ? JSON.parse(redeemCode.resource_bonuses)
        : redeemCode.resource_bonuses;

      const ramBonus = bonuses.max_ram_mb || 0;
      const cpuBonus = bonuses.max_cpu_percent || 0;
      const diskBonus = bonuses.max_disk_mb || 0;
      const serversBonus = bonuses.max_servers || 0;

      if (ramBonus || cpuBonus || diskBonus || serversBonus) {
        await conn.execute(
          'UPDATE users SET max_ram_mb = max_ram_mb + ?, max_cpu_percent = max_cpu_percent + ?, max_disk_mb = max_disk_mb + ?, max_servers = max_servers + ? WHERE id = ?',
          [ramBonus, cpuBonus, diskBonus, serversBonus, userId]
        );
      }
    }

    // Increment use count
    await conn.execute(
      'UPDATE redeem_codes SET use_count = use_count + 1 WHERE id = ?',
      [redeemCode.id]
    );

    // Record redemption
    await conn.execute(
      'INSERT INTO redeem_uses (user_id, code_id) VALUES (?, ?)',
      [userId, redeemCode.id]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { coins: redeemCode.coin_reward, bonuses: redeemCode.resource_bonuses || null };
}

module.exports = { redeem };
