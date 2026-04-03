'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../../config/database');

const router = express.Router();

// GET / — list all shop items
router.get('/', async (req, res) => {
  const [items] = await pool.execute('SELECT * FROM shop_items ORDER BY id DESC');
  return res.render('admin/shop', { user: req.user, items });
});

// POST /add — add new item
router.post(
  '/add',
  [
    body('name').trim().notEmpty().withMessage('Name required'),
    body('description').trim().optional(),
    body('coin_cost').notEmpty().withMessage('Cost required').isInt({ min: 1 }).withMessage('Cost must be >= 1'),
    body('resource_type').isIn(['ram', 'cpu', 'disk', 'servers']).withMessage('Invalid type'),
    body('resource_amount').notEmpty().withMessage('Amount required').isInt({ min: 1 }).withMessage('Amount must be >= 1'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join(', '));
      return res.redirect('/admin/shop');
    }
    const { name, description, coin_cost, resource_type, resource_amount } = req.body;
    await pool.execute(
      'INSERT INTO shop_items (name, description, coin_cost, resource_type, resource_amount) VALUES (?, ?, ?, ?, ?)',
      [name, description || '', Number(coin_cost), resource_type, Number(resource_amount)]
    );
    req.flash('success', 'Shop item added.');
    return res.redirect('/admin/shop');
  }
);

// POST /:id/toggle — toggle active/inactive
router.post('/:id/toggle', async (req, res) => {
  await pool.execute(
    'UPDATE shop_items SET is_active = NOT is_active WHERE id = ?',
    [req.params.id]
  );
  return res.redirect('/admin/shop');
});

// POST /:id/delete — delete item
router.post('/:id/delete', async (req, res) => {
  await pool.execute('DELETE FROM shop_items WHERE id = ?', [req.params.id]);
  req.flash('success', 'Item deleted.');
  return res.redirect('/admin/shop');
});

module.exports = router;
