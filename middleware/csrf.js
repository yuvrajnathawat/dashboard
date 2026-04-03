'use strict';

const csurf = require('csurf');

const csrfProtection = csurf({ cookie: false, value: (req) => {
  return req.body._csrf || req.headers['csrf-token'] || req.headers['x-csrf-token'] || req.headers['xsrf-token'];
} });

function csrfMiddleware(req, res, next) {
  csrfProtection(req, res, (err) => {
    if (err) return next(err);
    // Always set csrfToken so it's available in all views including after POST redirects
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
