'use strict';

const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const { earnLimiter } = require('../middleware/rateLimiter');
const earnService = require('../services/earnService');

const router = express.Router();

// GET /earn — render earn page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const links = await earnService.getLinksForUser(req.user.id);
    return res.render('earn', { links, user: req.user });
  } catch (err) {
    console.error('Earn page error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST /earn/:id/start — start earn flow
router.post('/:id/start', isAuthenticated, earnLimiter, async (req, res) => {
  try {
    const result = await earnService.startEarn(req.user.id, req.params.id, req.session);
    return res.json(result);
  } catch (err) {
    if (err.message === 'Link not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === 'Link is on cooldown') {
      return res.status(429).json({ error: err.message, cooldownRemainingSeconds: err.cooldownRemainingSeconds });
    }
    console.error('Earn start error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /earn/:id/verify — verify earn completion
router.post('/:id/verify', isAuthenticated, async (req, res) => {
  try {
    const result = await earnService.verifyEarn(req.user.id, req.params.id, req.session);
    return res.json(result);
  } catch (err) {
    if (err.message === 'Invalid verification') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'Link is on cooldown') {
      return res.status(429).json({ error: err.message, cooldownRemainingSeconds: err.cooldownRemainingSeconds });
    }
    console.error('Earn verify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
