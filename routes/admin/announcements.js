'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../../config/database');

const router = express.Router();

// GET / — list all announcements
router.get('/', async (req, res) => {
  const [items] = await pool.execute('SELECT * FROM announcements ORDER BY sort_order ASC, id DESC');
  return res.render('admin/announcements', { user: req.user, items });
});

// POST /add
router.post(
  '/add',
  [
    body('title').trim().notEmpty().withMessage('Title required'),
    body('type').isIn(['banner', 'video', 'promotion']).withMessage('Invalid type'),
    body('position').isIn(['top', 'dashboard', 'sidebar']).withMessage('Invalid position'),
    body('content').trim().optional(),
    body('embed_url').trim().optional(),
    body('thumbnail_url').trim().optional(),
    body('link_url').trim().optional(),
    body('link_text').trim().optional(),
    body('sort_order').toInt().optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join(', '));
      return res.redirect('/admin/announcements');
    }
    const { title, type, content, embed_url, thumbnail_url, link_url, link_text, position, sort_order, video_height, video_max_width } = req.body;

    // Auto-add new columns if missing (safe migration)
    try { await pool.execute('ALTER TABLE announcements ADD COLUMN thumbnail_url VARCHAR(500) DEFAULT NULL'); } catch (_) {}
    try { await pool.execute('ALTER TABLE announcements ADD COLUMN video_height INT DEFAULT 360'); } catch (_) {}
    try { await pool.execute('ALTER TABLE announcements ADD COLUMN video_max_width INT DEFAULT 0'); } catch (_) {}

    await pool.execute(
      'INSERT INTO announcements (title, type, content, embed_url, thumbnail_url, link_url, link_text, position, sort_order, video_height, video_max_width) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, type, content || '', embed_url || '', thumbnail_url || '', link_url || '', link_text || '', position, sort_order || 0, Number(video_height) || 360, Number(video_max_width) || 0]
    );
    req.flash('success', 'Announcement added.');
    return res.redirect('/admin/announcements');
  }
);

// POST /:id/toggle
router.post('/:id/toggle', async (req, res) => {
  await pool.execute('UPDATE announcements SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
  return res.redirect('/admin/announcements');
});

// POST /:id/delete
router.post('/:id/delete', async (req, res) => {
  await pool.execute('DELETE FROM announcements WHERE id = ?', [req.params.id]);
  if (req.headers['x-csrf-token'] || req.headers['content-type'] === 'application/json') {
    return res.json({ success: true });
  }
  req.flash('success', 'Announcement deleted.');
  return res.redirect('/admin/announcements');
});

module.exports = router;
