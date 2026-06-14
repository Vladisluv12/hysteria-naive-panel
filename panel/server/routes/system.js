'use strict';

const express = require('express');
const fs = require('fs');
const { spawn } = require('child_process');
const { loadConfig } = require('../services/storage.js');
const { getTraffic } = require('../traffic.js');
const { requireAuth } = require('../middleware/auth.js');

const router = express.Router();
const TEST_MODE = process.env.TEST_MODE === '1';

function checkServiceActive(unit) {
  if (TEST_MODE) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const p = spawn('systemctl', ['is-active', unit]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', () => resolve(out.trim() === 'active'));
    p.on('error', () => resolve(false));
  });
}

router.get('/config', requireAuth, (req, res) => {
  res.json(loadConfig());
});

router.get('/system/version', requireAuth, (req, res) => {
  const VERSION_FILE = '/etc/rixxx-panel/version';
  const FALLBACK = '1.0.0';
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const v = fs.readFileSync(VERSION_FILE, 'utf8').trim();
      if (v && /^\d+\.\d+\.\d+$/.test(v)) {
        return res.json({ version: v, source: 'file' });
      }
    }
  } catch (_) { /* ignore — отдадим fallback */ }
  res.json({ version: FALLBACK, source: 'fallback' });
});

router.get('/status', requireAuth, async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.installed) {
    return res.json({ installed: false, stack: cfg.stack || { naive: false, hy2: false } });
  }
  const [naiveActive, hy2Active] = await Promise.all([
    cfg.stack.naive ? checkServiceActive('caddy') : Promise.resolve(null),
    cfg.stack.hy2 ? checkServiceActive('hysteria-server') : Promise.resolve(null)
  ]);
  res.json({
    installed: true,
    stack: cfg.stack,
    domain: cfg.domain,
    email: cfg.email,
    serverIp: cfg.serverIp,
    arch: cfg.arch,
    naive: cfg.stack.naive ? { active: naiveActive, usersCount: cfg.naiveUsers.length } : null,
    hy2:   cfg.stack.hy2   ? { active: hy2Active,   usersCount: cfg.hy2Users.length }   : null,
  });
});

router.get('/traffic', requireAuth, async (req, res) => {
  try {
    const data = await getTraffic();
    res.json(data);
  } catch (e) {
    res.json({ daily: null, connections: { naive: null, hy2: null }, hourly: [], lastReset: null, error: e.message });
  }
});

router.post('/service/:kind/:action', requireAuth, (req, res) => {
  const { kind, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'bad action' });
  const unit = kind === 'naive' ? 'caddy' : kind === 'hy2' ? 'hysteria-server' : null;
  if (!unit) return res.status(400).json({ error: 'bad kind' });

  if (TEST_MODE) {
    return checkServiceActive(unit).then(active => {
      res.json({
        success: true,
        active,
        message: `${unit} ${action} — test-mode stub`
      });
    });
  }
  const p = spawn('systemctl', [action, unit]);
  p.on('close', (code) => {
    if (code !== 0) {
      return res.json({ success: false, message: `${unit} ${action} failed (code ${code})` });
    }
    setTimeout(() => {
      checkServiceActive(unit).then(active => {
        res.json({
          success: true,
          active,
          message: active
            ? `${unit} ${action} — сервис активен`
            : `${unit} ${action} — команда принята (сервис ещё стартует)`
        });
      }).catch(() => {
        res.json({ success: true, active: null, message: `${unit} ${action} OK` });
      });
    }, 1500);
  });
  p.on('error', () => res.json({ success: false, message: 'systemctl недоступен' }));
});

module.exports = router;
