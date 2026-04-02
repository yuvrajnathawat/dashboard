'use strict';

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./database');

const store = new MySQLStore({}, pool);

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

module.exports = sessionMiddleware;
