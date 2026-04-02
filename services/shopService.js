'use strict';

const pool = require('../config/database');
const { CoinError } = require('./coinService');

/**
 * Get all active shop items.
 * @returns {Promise<Array>}
 */
async function getItems() {
  const [rows] = await pool.execute(
    'SELECT * FROM shop_items WHERE is_active = 1'
  );
  return rows;
}

/**
 * Purchase a shop item for a user.
 * @param {number} userId
 * @param {number} itemId
 * @returns {Promise<{newLimits: object, newBalance: number}>}
 * @throws {Error} if item not found
 * @throws {CoinError} if insufficient coins
 */
async function purchase(userId, itemId) {
  // 1. Look up item
  const [items] = await pool.execute(
    'SELECT * FROM shop_items WHERE id = ? AND is_active = 1',
    [itemId]
  );

  if (!items.length) {
    throw new Error('Item not found');
  }

  const item = items[0];

  // 2. Begin transaction
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // a. Lock user row and check balance
    const [users] = await conn.execute(
      'SELECT coins FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (!users.length || Number(users[0].coins) < item.coin_cost) {
      await conn.rollback();
      throw new CoinError('Insufficient coins');
    }

    // b. Deduct coins
    await conn.execute(
      'UPDATE users SET coins = coins - ? WHERE id = ?',
      [item.coin_cost, userId]
    );

    // c. Record coin transaction
    await conn.execute(
      'INSERT INTO coin_transactions (user_id, amount, reason) VALUES (?, ?, ?)',
      [userId, -item.coin_cost, 'shop']
    );

    // d. Apply resource effect
    switch (item.resource_type) {
      case 'ram':
        await conn.execute(
          'UPDATE users SET max_ram_mb = max_ram_mb + ? WHERE id = ?',
          [item.resource_amount, userId]
        );
        break;
      case 'cpu':
        await conn.execute(
          'UPDATE users SET max_cpu_percent = max_cpu_percent + ? WHERE id = ?',
          [item.resource_amount, userId]
        );
        break;
      case 'disk':
        await conn.execute(
          'UPDATE users SET max_disk_mb = max_disk_mb + ? WHERE id = ?',
          [item.resource_amount, userId]
        );
        break;
      case 'servers':
        await conn.execute(
          'UPDATE users SET max_servers = max_servers + ? WHERE id = ?',
          [item.resource_amount, userId]
        );
        break;
    }

    // e. Record purchase
    await conn.execute(
      'INSERT INTO shop_purchases (user_id, item_id, coins_spent) VALUES (?, ?, ?)',
      [userId, item.id, item.coin_cost]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // 3. Return updated limits and balance
  const [updated] = await pool.execute(
    'SELECT max_ram_mb, max_cpu_percent, max_disk_mb, max_servers, coins FROM users WHERE id = ?',
    [userId]
  );

  const u = updated[0];
  return {
    newLimits: {
      max_ram_mb: u.max_ram_mb,
      max_cpu_percent: u.max_cpu_percent,
      max_disk_mb: u.max_disk_mb,
      max_servers: u.max_servers,
    },
    newBalance: Number(u.coins),
  };
}

module.exports = { getItems, purchase };
