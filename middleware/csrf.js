'use strict';

const csurf = require('csurf');

const csrfProtection = csurf({ cookie: false, value: (req) => {
  return req.body._csrf ||
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'] ||
    req.headers['csrf-token'];
} });

function csrfMiddleware(req, res, next) {
  // Skip CSRF for admin API JSON requests — protected by isAdmin middleware
  if (req.path.startsWith('/admin') && req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    try {
      res.locals.csrfToken = '';
    } catch (e) {}
    return next();
  }

  csrfProtection(req, res, (err) => {
    if (err) return next(err);
    try {
      res.locals.csrfToken = req.csrfToken();
    } catch (e) {
      res.locals.csrfToken = '';
    }
    return next();
  });
}

function csrfErrorHandler(err, req, res, next) {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', { message: 'Invalid CSRF token.' });
  }
  return next(err);
}

module.exports = { csrfMiddleware, csrfErrorHandler };
