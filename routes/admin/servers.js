'use strict';

const express = require('express');
const pool = require('../../config/database');
const pterodactylService = require('../../services/pterodactylService');

const router = express.Router();

// GET / — paginated server list with owner username
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await pool.execute(
      "SELECT COUNT(*) AS total FROM servers WHERE status != 'deleted'"
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [servers] = await pool.execute(
      `SELECT s.*, u.username AS owner_username
       FROM servers s
       JOIN users u ON s.user_id = u.id
       WHERE s.status != 'deleted'
       ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return res.render('admin/servers', {
      servers,
      page,
      totalPages,
      user: req.user,
    });
  } catch (err) {
    console.error('Admin servers list error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST /:id/suspend — suspend a server
router.post('/:id/suspend', async (req, res) => {
  const serverId = parseInt(req.params.id);
  try {
    const [rows] = await pool.execute('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!rows.length) return res.status(404).json({ error: 'Server not found' });

    await pterodactylService.suspendServer(rows[0].ptero_server_id);
    await pool.execute("UPDATE servers SET status = 'suspended' WHERE id = ?", [serverId]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin suspend server error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /:id/unsuspend — unsuspend a server
router.post('/:id/unsuspend', async (req, res) => {
  const serverId = parseInt(req.params.id);
  try {
    const [rows] = await pool.execute('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!rows.length) return res.status(404).json({ error: 'Server not found' });

    await pterodactylService.unsuspendServer(rows[0].ptero_server_id);
    await pool.execute("UPDATE servers SET status = 'active' WHERE id = ?", [serverId]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin unsuspend server error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete a server
router.delete('/:id', async (req, res) => {
  const serverId = parseInt(req.params.id);
  try {
    const [rows] = await pool.execute('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!rows.length) return res.status(404).json({ error: 'Server not found' });

    await pterodactylService.deleteServer(rows[0].ptero_server_id);
    await pool.execute('DELETE FROM servers WHERE id = ?', [serverId]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin delete server error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /:id/extend — extend server expiry by N days
router.post('/:id/extend', async (req, res) => {
  const serverId = parseInt(req.params.id);
  const days = parseInt(req.body.days);

  if (!Number.isInteger(days) || days <= 0) {
    return res.status(400).json({ error: 'Invalid days value' });
  }

  try {
    const [rows] = await pool.execute('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!rows.length) return res.status(404).json({ error: 'Server not found' });

    await pool.execute(
      'UPDATE servers SET expires_at = DATE_ADD(expires_at, INTERVAL ? DAY) WHERE id = ?',
      [days, serverId]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin extend server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/reinstall — reinstall a server
router.post('/:id/reinstall', async (req, res) => {
  const serverId = parseInt(req.params.id);
  try {
    const [rows] = await pool.execute('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!rows.length) return res.status(404).json({ error: 'Server not found' });

    await pterodactylService.reinstallServer(rows[0].ptero_server_id);

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin reinstall server error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
