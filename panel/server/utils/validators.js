'use strict';

function isValidDomain(s) {
  return typeof s === 'string'
    && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(s)
    && s.length <= 253;
}

function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

function isValidUsername(s) {
  return typeof s === 'string' && /^[A-Za-z0-9_.-]{1,32}$/.test(s);
}

function isValidPassword(s) {
  return typeof s === 'string' && s.length >= 8 && s.length <= 128
    && /^[A-Za-z0-9!@#$%^&*_+\-=.,~]+$/.test(s);
}

function isValidExpireDays(n) {
  if (n === undefined || n === null || n === '' || n === 0 || n === '0') return true;
  const v = parseInt(n, 10);
  return Number.isFinite(v) && v >= 1 && v <= 3650;
}

function computeExpiresAt(days) {
  const d = parseInt(days, 10);
  if (!Number.isFinite(d) || d <= 0) return null;
  return new Date(Date.now() + d * 86400 * 1000).toISOString();
}

function isExpired(user) {
  if (!user || !user.expiresAt) return false;
  const t = Date.parse(user.expiresAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() >= t;
}

function remainingSeconds(user) {
  if (!user || !user.expiresAt) return null;
  const t = Date.parse(user.expiresAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((t - Date.now()) / 1000));
}

module.exports = {
  isValidDomain,
  isValidEmail,
  isValidUsername,
  isValidPassword,
  isValidExpireDays,
  computeExpiresAt,
  isExpired,
  remainingSeconds
};
