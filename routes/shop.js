'use strict';

const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const shopService = require('../services/shopService');
const pterodactylService = require('../services/pterodactylService');
const pool = require('../config/database');

const router = express.Router();

// GET /shop — render shop page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const items = await shopService.getItems();
    return res.render('shop', { items, user: req.user });
  } catch (err) {
    console.error('Shop page error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// GET /shop/servers — return user's active servers for upgrade modal
router.get('/servers', isAuthenticated, async (req, res) => {
  try {
    const [servers] = await pool.execute(
      "SELECT id, name, ram_mb, cpu_percent, disk_mb, ptero_server_id FROM servers WHERE user_id = ? AND status != 'deleted'",
      [req.user.id]
    );
    return res.json({ servers });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// POST /shop/buy — purchase an item, optionally upgrade a specific server
router.post('/buy', isAuthenticated, async (req, res) => {
  const itemId = Number(req.body.item_id);
  const serverId = req.body.server_id ? Number(req.body.server_id) : null;

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid item_id' });
  }

  try {
    const result = await shopService.purchase(req.user.id, itemId);

    // If user selected a specific server to upgrade, update it on Pterodactyl too
    if (serverId) {
      const [rows] = await pool.execute(
        'SELECT * FROM servers WHERE id = ? AND user_id = ?',
        [serverId, req.user.id]
      );

      if (rows.length) {
        const server = rows[0];
        const [item] = await pool.execute('SELECT * FROM shop_items WHERE id = ?', [itemId]);

        if (item.length && item[0].resource_type !== 'servers') {
          const it = item[0];
          let newRam = server.ram_mb;
          let newCpu = server.cpu_percent;
          let newDisk = server.disk_mb;

          if (it.resource_type === 'ram')  newRam  += it.resource_amount;
          if (it.resource_type === 'cpu')  newCpu  += it.resource_amount;
          if (it.resource_type === 'disk') newDisk += it.resource_amount;

          // Update server limits on Pterodactyl
          try {
            await pterodactylService.updateServerBuild(server.ptero_server_id, {
              allocation: server.allocation_id,
              memory: newRam,
              cpu: newCpu,
              disk: newDisk,
              swap: 0,
              io: 500,
            });
          } catch (pteroErr) {
            console.error('Pterodactyl server upgrade error (non-fatal):', pteroErr.message);
          }

          // Update local DB
          await pool.execute(
            'UPDATE servers SET ram_mb = ?, cpu_percent = ?, disk_mb = ? WHERE id = ?',
            [newRam, newCpu, newDisk, serverId]
          );
        }
      }
    }

    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
