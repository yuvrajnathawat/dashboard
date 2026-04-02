'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../config/database');

const router = express.Router();

// GET / — list all redeem codes
router.get('/', async (req, res) => {
  try {
    const [codes] = await pool.execute(
      'SELECT * FROM redeem_codes ORDER BY created_at DESC'
    );
    return res.render('admin/codes', { codes, user: req.user });
  } catch (err) {
    console.error('Admin codes list error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// POST / — create a single redeem code
router.post('/', async (req, res) => {
  const { code, coin_reward, resource_bonuses, max_uses, expires_at } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Code is required' });
  }

  const coinReward = parseInt(coin_reward) || 0;
  const maxUses = max_uses ? parseInt(max_uses) : null;
  const resourceBonuses = resource_bonuses
    ? (typeof resource_bonuses === 'string' ? JSON.parse(resource_bonuses) : resource_bonuses)
    : null;
  const expiresAt = expires_at || null;

  try {
    await pool.execute(
      'INSERT INTO redeem_codes (code, coin_reward, resource_bonuses, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)',
      [code.trim().toUpperCase(), coinReward, resourceBonuses ? JSON.stringify(resourceBonuses) : null, maxUses, expiresAt]
    );
    return res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Code already exists' });
    }
    console.error('Admin create code error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /bulk — bulk generate redeem codes
router.post('/bulk', async (req, res) => {
  const { count, coin_reward, resource_bonuses, max_uses, expires_at } = req.body;

  const codeCount = parseInt(count);
  if (!Number.isInteger(codeCount) || codeCount <= 0 || codeCount > 1000) {
    return res.status(400).json({ error: 'Count must be between 1 and 1000' });
  }

  const coinReward = parseInt(coin_reward) || 0;
  const maxUses = max_uses ? parseInt(max_uses) : null;
  const resourceBonuses = resource_bonuses
    ? (typeof resource_bonuses === 'string' ? JSON.parse(resource_bonuses) : resource_bonuses)
    : null;
  const expiresAt = expires_at || null;
  const resourceBonusesJson = resourceBonuses ? JSON.stringify(resourceBonuses) : null;

  const codes = Array.from({ length: codeCount }, () => uuidv4().toUpperCase());

  try {
    const placeholders = codes.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = codes.flatMap((code) => [
      code,
      coinReward,
      resourceBonusesJson,
      maxUses,
      expiresAt,
    ]);

    await pool.execute(
      `INSERT INTO redeem_codes (code, coin_reward, resource_bonuses, max_uses, expires_at) VALUES ${placeholders}`,
      values
    );

    return res.json({ success: true, codes });
  } catch (err) {
    console.error('Admin bulk codes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/deactivate — deactivate a code by setting max_uses = use_count
router.post('/:id/deactivate', async (req, res) => {
  const codeId = parseInt(req.params.id);
  try {
    const [rows] = await pool.execute('SELECT * FROM redeem_codes WHERE id = ?', [codeId]);
    if (!rows.length) return res.status(404).json({ error: 'Code not found' });

    await pool.execute(
      'UPDATE redeem_codes SET max_uses = use_count WHERE id = ?',
      [codeId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Admin deactivate code error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
