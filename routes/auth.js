'use strict';

const express = require('express');
const passport = require('passport');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Apply rate limiter to all auth routes
router.use(authLimiter);

// GET /auth/discord — redirect to Discord OAuth2
router.get('/discord', passport.authenticate('discord'));

// GET /auth/discord/callback — OAuth2 callback
router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/',
    failureFlash: true,
  }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// GET /auth/logout — destroy session and redirect to /
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

module.exports = router;
