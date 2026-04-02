'use strict';

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect('/');
}

function isAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).render('error', { message: 'Access denied.' });
  }
  return next();
}

module.exports = { isAuthenticated, isAdmin };
