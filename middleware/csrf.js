'use strict';

const csurf = require('csurf');

const csrfProtection = csurf({ cookie: false });

function csrfMiddleware(req, res, next) {
  csrfProtection(req, res, (err) => {
    if (err) return next(err);
    if (req.method === 'GET') {
      res.locals.csrfToken = req.csrfToken();
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
