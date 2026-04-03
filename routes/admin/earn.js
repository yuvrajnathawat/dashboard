'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../../config/database');

const router = express.Router();

// GET / — list all earn links
router.get('/', async (req, res) => {
  const [links] = await pool.execute('SELECT * FROM earn_links ORDER BY id DESC');
  return res.render('admin/earn', { user: req.user, links });
});

// POST /add — add new earn link
router.post(
  '/add',
  [
    body('name').trim().notEmpty().withMessage('Name required'),
    body('url').trim().isURL().withMessage('Valid URL required'),
    body('coin_reward').toInt().isInt({ min: 1 }).withMessage('Reward must be >= 1'),
    body('cooldown_seconds').toInt().isInt({ min: 0 }).withMessage('Cooldown must be >= 0'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join(', '));
      return res.redirect('/admin/earn');
    }
    const { name, url, coin_reward, cooldown_seconds } = req.body;
    await pool.execute(
      'INSERT INTO earn_links (name, url, coin_reward, cooldown_seconds) VALUES (?, ?, ?, ?)',
      [name, url, coin_reward, cooldown_seconds]
    );
    req.flash('success', 'Earn link added.');
    return res.redirect('/admin/earn');
  }
);

// POST /:id/toggle — toggle active/inactive
router.post('/:id/toggle', async (req, res) => {
  await pool.execute(
    'UPDATE earn_links SET is_active = NOT is_active WHERE id = ?',
    [req.params.id]
  );
  return res.redirect('/admin/earn');
});

// POST /:id/delete — delete link
router.post('/:id/delete', async (req, res) => {
  await pool.execute('DELETE FROM earn_links WHERE id = ?', [req.params.id]);
  req.flash('success', 'Earn link deleted.');
  return res.redirect('/admin/earn');
});

module.exports = router;
