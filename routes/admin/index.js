'use strict';

const express = require('express');
const { isAdmin } = require('../../middleware/auth');
const pool = require('../../config/database');

const usersRouter = require('./users');
const serversRouter = require('./servers');
const eggsRouter = require('./eggs');
const codesRouter = require('./codes');
const coinsRouter = require('./coins');
const settingsRouter = require('./settings');
const shopRouter = require('./shop');
const earnRouter = require('./earn');
const announcementsRouter = require('./announcements');

const router = express.Router();

// Apply isAdmin middleware to all admin routes
router.use(isAdmin);

// Mount sub-routers
router.use('/users', usersRouter);
router.use('/servers', serversRouter);
router.use('/eggs', eggsRouter);
router.use('/codes', codesRouter);
router.use('/coins', coinsRouter);
router.use('/settings', settingsRouter);
router.use('/shop', shopRouter);
router.use('/earn', earnRouter);
router.use('/announcements', announcementsRouter);

// GET / — admin dashboard overview
router.get('/', async (req, res) => {
  try {
    const [[{ totalUsers }]] = await pool.execute(
      'SELECT COUNT(*) AS totalUsers FROM users'
    );

    const [[{ totalActiveServers }]] = await pool.execute(
      "SELECT COUNT(*) AS totalActiveServers FROM servers WHERE status = 'active'"
    );

    const [[{ totalSuspendedServers }]] = await pool.execute(
      "SELECT COUNT(*) AS totalSuspendedServers FROM servers WHERE status = 'suspended'"
    );

    const [[{ expiringIn24h }]] = await pool.execute(
      "SELECT COUNT(*) AS expiringIn24h FROM servers WHERE status = 'active' AND expires_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR)"
    );

    return res.render('admin/dashboard', {
      user: req.user,
      stats: {
        totalUsers,
        totalActiveServers,
        totalSuspendedServers,
        expiringIn24h,
      },
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

module.exports = router;
