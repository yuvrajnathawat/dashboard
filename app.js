'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const passport = require('passport');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');

const sessionMiddleware = require('./config/session');
const configurePassport = require('./config/passport');
const { csrfMiddleware, csrfErrorHandler } = require('./middleware/csrf');

const dashboardRouter = require('./routes/dashboard');
const authRouter = require('./routes/auth');
const serverRouter = require('./routes/server');
const afkRouter = require('./routes/afk');
const earnRouter = require('./routes/earn');
const redeemRouter = require('./routes/redeem');
const shopRouter = require('./routes/shop');
const adminRouter = require('./routes/admin/index');

const expiryService = require('./services/expiryService');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy — required when behind Nginx
app.set('trust proxy', 1);

// Logging
if (NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Security headers — CSP configured to allow inline scripts and Discord CDN
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(sessionMiddleware);

// Passport
configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

// Flash messages
app.use(flash());

// CSRF protection
app.use(csrfMiddleware);

const pool = require('./config/database');

// Branding middleware — loads site_name, favicon_url, logo_url, bg_image_url from DB
app.use(async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT `key`, value FROM settings WHERE `key` IN ('site_name','favicon_url','logo_url','bg_image_url')"
    );
    const branding = { site_name: 'FreeNode', favicon_url: '', logo_url: '', bg_image_url: '' };
    for (const row of rows) branding[row.key] = row.value || '';
    res.locals.branding = branding;
  } catch (_) {
    res.locals.branding = { site_name: 'FreeNode', favicon_url: '', logo_url: '', bg_image_url: '' };
  }
  next();
});

// Announcements middleware — passes active announcements to all views
app.use(async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM announcements WHERE is_active = 1 ORDER BY sort_order ASC, id DESC"
    );
    res.locals.announcements = rows;
  } catch (_) {
    res.locals.announcements = [];
  }
  next();
});

// Template locals
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
  };
  next();
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
// Do NOT extract scripts — views handle their own scripts inline

// Allow views to override layout via res.locals.layout
app.use((req, res, next) => {
  res.locals.layout = 'layouts/main';
  next();
});

// Obfuscate HTML — minify + strip comments so view-source is less readable
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);
  res.render = function(view, options, callback) {
    originalRender(view, options, function(err, html) {
      if (err) return callback ? callback(err) : next(err);

      // Only process full HTML pages
      if (!html || !html.trim().startsWith('<!DOCTYPE')) {
        if (callback) return callback(null, html);
        return res.send(html);
      }

      // Strip comments and collapse whitespace — keeps functionality intact
      const minified = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*/g, '')
        .trim();

      if (callback) return callback(null, minified);
      res.send(minified);
    });
  };
  next();
});

// Routers
app.use('/', dashboardRouter);
app.use('/auth', authRouter);
app.use('/servers', serverRouter);
app.use('/afk', afkRouter);
app.use('/earn', earnRouter);
app.use('/redeem', redeemRouter);
app.use('/shop', shopRouter);
app.use('/admin', adminRouter);

// Expiry cron
expiryService.startExpiryJob();

// CSRF error handler
app.use(csrfErrorHandler);

// Production error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (NODE_ENV === 'production') {
    console.error(err);
    res.status(500).render('error', { message: 'Something went wrong.' });
  } else {
    res.status(500).send('<pre>' + err.stack + '</pre>');
  }
});

module.exports = app;
