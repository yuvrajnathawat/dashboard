'use strict';

const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const { redeemLimiter } = require('../middleware/rateLimiter');
const redeemService = require('../services/redeemService');

const router = express.Router();

// GET /redeem — render redeem page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    return res.render('redeem', { user: req.user });
  } catch (err) {
    console.error('Redeem page error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST /redeem — submit a redeem code
router.post('/', isAuthenticated, redeemLimiter, async (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Code is required' });
  }

  try {
    const result = await redeemService.redeem(req.user.id, code.trim());
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
