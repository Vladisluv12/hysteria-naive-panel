'use strict';

const fs = require('fs');
const { loadConfig } = require('../services/storageFactory.js');
const { getTraffic } = require('../traffic.js');
const { serviceIsActive, serviceAction } = require('../services/systemAdapter.js');

function getConfig(req, res) {
  res.json(loadConfig());
}

function getVersion(req, res) {
  const VERSION_FILE = '/etc/rixxx-panel/version';
  const FALLBACK = '1.0.0';
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const v = fs.readFileSync(VERSION_FILE, 'utf8').trim();
      if (v && /^\d+\.\d+\.\d+$/.test(v)) {
        return res.json({ version: v, source: 'file' });
      }
    }
  } catch (_) { /* ignore */ }
  res.json({ version: FALLBACK, source: 'fallback' });
}

async function getStatus(req, res) {
  const cfg = loadConfig();
  if (!cfg.installed) {
    return res.json({ installed: false, stack: cfg.stack || { naive: false, hy2: false } });
  }
  const [naiveActive, hy2Active] = await Promise.all([
    cfg.stack.naive ? serviceIsActive('caddy') : Promise.resolve(null),
    cfg.stack.hy2 ? serviceIsActive('hysteria-server') : Promise.resolve(null)
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
}

async function getTrafficHandler(req, res) {
  try {
    const data = await getTraffic();
    res.json(data);
  } catch (e) {
    res.json({ daily: null, connections: { naive: null, hy2: null }, hourly: [], lastReset: null, error: e.message });
  }
}

async function serviceActionHandler(req, res) {
  const { kind, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'bad action' });
  const unit = kind === 'naive' ? 'caddy' : kind === 'hy2' ? 'hysteria-server' : null;
  if (!unit) return res.status(400).json({ error: 'bad kind' });

  const result = await serviceAction(action, unit);
  res.json({ success: result.success, active: result.active });
}

module.exports = { getConfig, getVersion, getStatus, getTraffic: getTrafficHandler, serviceAction: serviceActionHandler };
