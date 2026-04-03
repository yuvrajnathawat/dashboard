'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../../config/database');

const router = express.Router();

// Numeric setting keys that must be positive numbers
const NUMERIC_KEYS = [
  'creation_cost',
  'renewal_cost',
  'renewal_period_days',
  'deletion_grace_days',
  'afk_coins_per_ping',
  'afk_daily_limit',
  'afk_captcha_interval_minutes',
  'max_servers_per_user',
  'default_ram_mb',
  'default_cpu_percent',
  'default_disk_mb',
];

// URL setting keys that must be valid URLs
const URL_KEYS = ['pterodactyl_url'];

// String setting keys (no special validation)
const STRING_KEYS = ['site_name', 'favicon_url', 'logo_url', 'bg_image_url'];

// GET / — render settings page
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM settings');
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return res.render('admin/settings', { settings, user: req.user });
  } catch (err) {
    console.error('Admin settings get error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST / — save settings with validation
router.post(
  '/',
  [
    ...NUMERIC_KEYS.map((key) =>
      body(key)
        .optional()
        .isFloat({ min: 0.0001 })
        .withMessage(`${key} must be a positive number`)
    ),
    ...URL_KEYS.map((key) =>
      body(key)
        .optional()
        .isURL()
        .withMessage(`${key} must be a valid URL`)
    ),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    try {
      const updates = Object.entries(req.body);
      for (const [key, value] of updates) {
        await pool.execute(
          'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
          [key, value, value]
        );
      }

      if (req.session) {
        req.flash && req.flash('success', 'Settings saved successfully.');
      }
      return res.redirect('back');
    } catch (err) {
      console.error('Admin settings save error:', err);
      return res.status(500).render('error', { message: 'Internal server error' });
    }
  }
);

module.exports = router;
