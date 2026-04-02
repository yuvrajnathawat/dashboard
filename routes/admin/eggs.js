'use strict';

const express = require('express');
const pool = require('../../config/database');
const pterodactylService = require('../../services/pterodactylService');

const router = express.Router();

// GET / — list all nests+eggs from Pterodactyl with enabled status
router.get('/', async (req, res) => {
  try {
    const rawNests = await pterodactylService.getAllNests();

    // Fetch eggs for each nest
    const nests = await Promise.all(
      rawNests.map(async (nest) => {
        const eggs = await pterodactylService.getAllEggs(nest.attributes.id);
        return { ...nest, eggs };
      })
    );

    // Get enabled egg IDs from settings
    const [rows] = await pool.execute(
      "SELECT value FROM settings WHERE `key` = 'enabled_egg_ids'"
    );
    const enabledEggIds = rows.length ? JSON.parse(rows[0].value) : [];

    return res.render('admin/eggs', { nests, enabledEggIds, user: req.user });
  } catch (err) {
    console.error('Admin eggs list error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST /:id/enable — add egg to enabled list
router.post('/:id/enable', async (req, res) => {
  const eggId = parseInt(req.params.id);
  try {
    const [rows] = await pool.execute(
      "SELECT value FROM settings WHERE `key` = 'enabled_egg_ids'"
    );
    const enabledEggIds = rows.length ? JSON.parse(rows[0].value) : [];

    if (!enabledEggIds.includes(eggId)) {
      enabledEggIds.push(eggId);
      await pool.execute(
        "UPDATE settings SET value = ? WHERE `key` = 'enabled_egg_ids'",
        [JSON.stringify(enabledEggIds)]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin enable egg error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/disable — remove egg from enabled list
router.post('/:id/disable', async (req, res) => {
  const eggId = parseInt(req.params.id);
  try {
    const [rows] = await pool.execute(
      "SELECT value FROM settings WHERE `key` = 'enabled_egg_ids'"
    );
    const enabledEggIds = rows.length ? JSON.parse(rows[0].value) : [];

    const updated = enabledEggIds.filter((id) => id !== eggId);
    await pool.execute(
      "UPDATE settings SET value = ? WHERE `key` = 'enabled_egg_ids'",
      [JSON.stringify(updated)]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin disable egg error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/defaults — set default resource values for an egg
router.post('/:id/defaults', async (req, res) => {
  const eggId = parseInt(req.params.id);
  const { ram_mb, cpu_percent, disk_mb } = req.body;

  const ramMb = parseInt(ram_mb);
  const cpuPercent = parseInt(cpu_percent);
  const diskMb = parseInt(disk_mb);

  if (
    !Number.isInteger(ramMb) || ramMb <= 0 ||
    !Number.isInteger(cpuPercent) || cpuPercent <= 0 ||
    !Number.isInteger(diskMb) || diskMb <= 0
  ) {
    return res.status(400).json({ error: 'Invalid resource values' });
  }

  const key = `egg_defaults_${eggId}`;
  const value = JSON.stringify({ ram_mb: ramMb, cpu_percent: cpuPercent, disk_mb: diskMb });

  try {
    await pool.execute(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      [key, value, value]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Admin egg defaults error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
