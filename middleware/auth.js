'use strict';

const pool = require('../config/database');

async function getSetting(key) {
  try {
    const [rows] = await pool.execute('SELECT value FROM settings WHERE `key` = ?', [key]);
    return rows.length ? rows[0].value : null;
  } catch (_) { return null; }
}

function isAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/');
  if (req.user && req.user.is_suspended) {
    // Allow logout even when suspended
    if (req.path === '/auth/logout') return next();
    // Render suspended page async
    getSetting('support_discord_url').then(function(discordUrl) {
      res.locals.layout = 'layouts/auth';
      return res.status(403).render('suspended', {
        user: req.user,
        discordUrl: discordUrl || 'https://discord.gg/V6WXckd8',
      });
    });
    return;
  }
  return next();
}

function isAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).render('error', { message: 'Access denied.' });
  }
  return next();
}

module.exports = { isAuthenticated, isAdmin };
