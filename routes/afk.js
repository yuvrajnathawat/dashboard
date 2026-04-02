'use strict';

const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const { afkLimiter } = require('../middleware/rateLimiter');
const afkService = require('../services/afkService');

const router = express.Router();

// GET /afk — render AFK page
router.get('/', isAuthenticated, (req, res) => {
  res.render('afk', { user: req.user });
});

// POST /afk/ping — handle AFK ping
router.post('/ping', isAuthenticated, afkLimiter, async (req, res) => {
  try {
    const result = await afkService.handlePing(req.user.id, req.session);
    return res.json(result);
  } catch (err) {
    console.error('AFK ping error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /afk/captcha-verify — verify CAPTCHA and reset session
router.post('/captcha-verify', isAuthenticated, async (req, res) => {
  try {
    const result = afkService.verifyCaptcha(req.user.id, req.session);
    return res.json(result);
  } catch (err) {
    console.error('AFK captcha verify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
