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

// Security headers
app.use(helmet());

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
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Allow views to override layout via res.locals.layout
app.use((req, res, next) => {
  res.locals.layout = 'layouts/main';
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
