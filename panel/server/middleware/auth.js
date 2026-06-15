'use strict';

const rateLimit = require('express-rate-limit');

const isTestMode = process.env.TEST_MODE === '1';
const loginRateLimitMax = isTestMode ? 1000 : 5;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: loginRateLimitMax,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = {
  loginLimiter,
  requireAuth
};
