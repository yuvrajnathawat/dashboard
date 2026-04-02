'use strict';

const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const shopService = require('../services/shopService');

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

// POST /shop/buy — purchase an item
router.post('/buy', isAuthenticated, async (req, res) => {
  const itemId = Number(req.body.item_id);

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid item_id' });
  }

  try {
    const result = await shopService.purchase(req.user.id, itemId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
