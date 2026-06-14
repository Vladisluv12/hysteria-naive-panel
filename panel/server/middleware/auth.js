'use strict';

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const csrfCookieName = 'rixxx_csrf';
const csrfHeaderName = 'x-csrf-token';

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfMiddleware(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/')) return next();
  const token = req.headers[csrfHeaderName];
  const stored = req.session?.csrfToken;
  if (!token || !stored || token !== stored) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = {
  loginLimiter,
  generateCsrfToken,
  csrfMiddleware,
  requireAuth,
  csrfCookieName
};
