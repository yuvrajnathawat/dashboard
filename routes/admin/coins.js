'use strict';

const express = require('express');
const pool = require('../../config/database');
const coinService = require('../../services/coinService');

const router = express.Router();

// GET / — paginated coin transactions with actor and recipient usernames
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM coin_transactions'
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [transactions] = await pool.execute(
      `SELECT ct.*,
              u.username AS recipient_username,
              a.username AS actor_username
       FROM coin_transactions ct
       JOIN users u ON ct.user_id = u.id
       LEFT JOIN users a ON ct.actor_id = a.id
       ORDER BY ct.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return res.render('admin/coins', {
      transactions,
      page,
      totalPages,
      user: req.user,
    });
  } catch (err) {
    console.error('Admin coins list error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST /give — give or take coins from a specific user
router.post('/give', async (req, res) => {
  const userId = parseInt(req.body.user_id);
  const amount = parseInt(req.body.amount);
  const reason = req.body.reason || 'Admin adjustment';

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user_id' });
  }
  if (!Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    let newBalance;
    if (amount > 0) {
      newBalance = await coinService.credit(userId, amount, reason, req.user.id);
    } else {
      newBalance = await coinService.debit(userId, Math.abs(amount), reason, req.user.id);
    }
    return res.json({ success: true, newBalance });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /broadcast — credit all users with the given amount
router.post('/broadcast', async (req, res) => {
  const amount = parseInt(req.body.amount);
  const reason = req.body.reason || 'Admin broadcast';

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    const count = await coinService.broadcastCredit(amount, reason, req.user.id);
    return res.json({ success: true, count });
  } catch (err) {
    console.error('Admin broadcast coins error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
