'use strict';

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const afkLimiter = rateLimit({
  windowMs: 70 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
});

const earnLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, afkLimiter, earnLimiter, redeemLimiter };
