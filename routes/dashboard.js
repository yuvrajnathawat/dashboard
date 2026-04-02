'use strict';

const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const pterodactylService = require('../services/pterodactylService');
const pool = require('../config/database');

const router = express.Router();

// GET / — redirect to /dashboard if logged in, else render login page
router.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  return res.render('index');
});

// GET /login — render login page for unauthenticated users
router.get('/login', (req, res) => {
  return res.render('index');
});

// GET /dashboard — main dashboard page (requires auth)
router.get('/dashboard', isAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    // Fetch user's non-deleted servers
    const [servers] = await pool.execute(
      "SELECT * FROM servers WHERE user_id = ? AND status != 'deleted' ORDER BY created_at DESC",
      [userId]
    );

    // Enrich each server with resource usage (null if unavailable)
    const serversWithUsage = await Promise.all(
      servers.map(async (server) => {
        let usage = null;
        if (server.ptero_server_uuid) {
          try {
            usage = await pterodactylService.getServerResourceUsage(
              server.ptero_server_uuid
            );
          } catch (_err) {
            // Server offline or still installing — usage stays null
          }
        }
        return { ...server, usage };
      })
    );

    // Quick stat: total servers
    const totalServers = servers.length;

    // Quick stat: coins earned today (positive transactions only)
    const [coinRows] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM coin_transactions WHERE user_id = ? AND amount > 0 AND DATE(created_at) = CURDATE()',
      [userId]
    );
    const coinsEarnedToday = Number(coinRows[0].total);

    // Quick stat: next expiry among active servers
    const activeServers = servers.filter((s) => s.status === 'active');
    let nextExpiry = null;
    if (activeServers.length > 0) {
      const earliest = activeServers.reduce((min, s) => {
        const exp = new Date(s.expires_at);
        return exp < min ? exp : min;
      }, new Date(activeServers[0].expires_at));
      nextExpiry = earliest;
    }

    return res.render('dashboard', {
      user: req.user,
      servers: serversWithUsage,
      totalServers,
      coinsEarnedToday,
      nextExpiry,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

module.exports = router;
