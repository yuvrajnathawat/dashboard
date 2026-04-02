'use strict';

const express = require('express');
const pool = require('../../config/database');
const coinService = require('../../services/coinService');
const pterodactylService = require('../../services/pterodactylService');

const router = express.Router();

// GET / — paginated, searchable user list with server count
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  try {
    let countQuery, listQuery, params;

    if (search) {
      const like = `%${search}%`;
      countQuery =
        'SELECT COUNT(*) AS total FROM users WHERE username LIKE ? OR discord_id LIKE ?';
      listQuery = `
        SELECT u.*, (SELECT COUNT(*) FROM servers s WHERE s.user_id = u.id AND s.status != 'deleted') AS server_count
        FROM users u
        WHERE u.username LIKE ? OR u.discord_id LIKE ?
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
      params = [like, like];
    } else {
      countQuery = 'SELECT COUNT(*) AS total FROM users';
      listQuery = `
        SELECT u.*, (SELECT COUNT(*) FROM servers s WHERE s.user_id = u.id AND s.status != 'deleted') AS server_count
        FROM users u
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
      params = [];
    }

    const [countRows] = await pool.execute(countQuery, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const listParams = search ? [...params, limit, offset] : [limit, offset];
    const [users] = await pool.execute(listQuery, listParams);

    return res.render('admin/users', {
      users,
      page,
      totalPages,
      search,
      user: req.user,
    });
  } catch (err) {
    console.error('Admin users list error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// GET /:id — single user details + their servers
router.get('/:id', async (req, res) => {
  const userId = parseInt(req.params.id);

  try {
    const [userRows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (!userRows.length) {
      return res.status(404).render('error', { message: 'User not found' });
    }
    const targetUser = userRows[0];

    const [servers] = await pool.execute(
      "SELECT * FROM servers WHERE user_id = ? AND status != 'deleted' ORDER BY created_at DESC",
      [userId]
    );

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ user: targetUser, servers });
    }

    return res.render('admin/users', {
      targetUser,
      servers,
      user: req.user,
      page: 1,
      totalPages: 1,
      search: '',
      users: [],
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST /:id/coins — adjust coin balance
router.post('/:id/coins', async (req, res) => {
  const userId = parseInt(req.params.id);
  const amount = parseInt(req.body.amount);
  const reason = req.body.reason || 'Admin adjustment';

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

// POST /:id/suspend — suspend a user
router.post('/:id/suspend', async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    await pool.execute('UPDATE users SET is_suspended = 1 WHERE id = ?', [userId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Admin suspend user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/unsuspend — unsuspend a user
router.post('/:id/unsuspend', async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    await pool.execute('UPDATE users SET is_suspended = 0 WHERE id = ?', [userId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Admin unsuspend user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id — delete user and all their servers
router.delete('/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    const [userRows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const targetUser = userRows[0];

    // Delete all servers from Pterodactyl
    const [servers] = await pool.execute(
      "SELECT * FROM servers WHERE user_id = ? AND status != 'deleted'",
      [userId]
    );
    for (const server of servers) {
      try {
        await pterodactylService.deleteServer(server.ptero_server_id);
      } catch (err) {
        console.error(`Failed to delete ptero server ${server.ptero_server_id}:`, err.message);
      }
    }

    // Delete Pterodactyl user account
    if (targetUser.ptero_user_id) {
      try {
        await pterodactylService.deleteUser(targetUser.ptero_user_id);
      } catch (err) {
        console.error(`Failed to delete ptero user ${targetUser.ptero_user_id}:`, err.message);
      }
    }

    // Delete from DB
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
