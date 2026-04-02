'use strict';

const pool = require('../config/database');

class CoinError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CoinError';
  }
}

/**
 * Credit coins to a user.
 * @param {number} userId
 * @param {number} amount
 * @param {string} reason
 * @param {number|null} actorId
 * @returns {Promise<number>} new balance
 */
async function credit(userId, amount, reason, actorId = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      'UPDATE users SET coins = coins + ? WHERE id = ?',
      [amount, userId]
    );
    await conn.execute(
      'INSERT INTO coin_transactions (user_id, actor_id, amount, reason) VALUES (?, ?, ?, ?)',
      [userId, actorId, amount, reason]
    );
    await conn.commit();
    const [rows] = await conn.execute(
      'SELECT coins FROM users WHERE id = ?',
      [userId]
    );
    return Number(rows[0].coins);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Debit coins from a user.
 * @param {number} userId
 * @param {number} amount
 * @param {string} reason
 * @param {number|null} actorId
 * @returns {Promise<number>} new balance
 * @throws {CoinError} if insufficient coins
 */
async function debit(userId, amount, reason, actorId = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT coins FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (!rows.length || Number(rows[0].coins) < amount) {
      await conn.rollback();
      throw new CoinError('Insufficient coins');
    }
    await conn.execute(
      'UPDATE users SET coins = coins - ? WHERE id = ?',
      [amount, userId]
    );
    await conn.execute(
      'INSERT INTO coin_transactions (user_id, actor_id, amount, reason) VALUES (?, ?, ?, ?)',
      [userId, actorId, -amount, reason]
    );
    await conn.commit();
    const [updated] = await conn.execute(
      'SELECT coins FROM users WHERE id = ?',
      [userId]
    );
    return Number(updated[0].coins);
  } catch (err) {
    if (!(err instanceof CoinError)) {
      await conn.rollback();
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Get a user's current coin balance.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function getBalance(userId) {
  const [rows] = await pool.execute(
    'SELECT coins FROM users WHERE id = ?',
    [userId]
  );
  return Number(rows[0].coins);
}

/**
 * Get paginated coin transactions for a user.
 * @param {number} userId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getTransactions(userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [rows] = await pool.execute(
    'SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [userId, limit, offset]
  );
  return rows;
}

/**
 * Credit all users with the given amount.
 * @param {number} amount
 * @param {string} reason
 * @param {number|null} actorId
 * @returns {Promise<number>} count of users credited
 */
async function broadcastCredit(amount, reason, actorId = null) {
  const [users] = await pool.execute('SELECT id FROM users');
  for (const user of users) {
    await credit(user.id, amount, reason, actorId);
  }
  return users.length;
}

module.exports = { CoinError, credit, debit, getBalance, getTransactions, broadcastCredit };
