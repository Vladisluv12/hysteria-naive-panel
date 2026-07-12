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

function kindToUnit(kind) {
  return kind === 'naive' ? 'naive'
    : kind === 'hy2' ? 'hysteria'
    : kind === 'mieru' ? 'mita'
    : kind === 'vless' ? 'xray'
    : kind === 'warp' ? 'warp' : null;
}

// Deliberately does NOT check live service status (systemctl is-active) —
// that's a shell-out per protocol and was making the whole dashboard wait
// on all of them before rendering anything. Each dashboard block fetches
// its own "active" state independently via getServiceStatus below, so a
// slow/hung service check only stalls that one block, not the page.
function getStatus(req, res) {
  const cfg = loadConfig();
  if (!cfg.installed) {
    return res.json({ installed: false, stack: cfg.stack || { naive: false, hy2: false, mieru: false, vless: false } });
  }
  const arch = cfg.arch || require('os').arch();
  let serverIp = cfg.serverIp;
  if (!serverIp) {
    const nets = require('os').networkInterfaces();
    for (const iface of Object.values(nets)) {
      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) { serverIp = info.address; break; }
      }
      if (serverIp) break;
    }
    if (!serverIp) serverIp = require('os').hostname();
  }
  res.json({
    installed: true,
    stack: cfg.stack,
    domain: cfg.domain,
    email: cfg.email,
    serverIp,
    arch,
    port: cfg.port,
    mieruPort: cfg.mieruPort || cfg.port,
    vlessPort: cfg.vlessPort || cfg.port,
    naive: cfg.stack.naive ? { active: null, usersCount: (cfg.naiveUsers || []).length } : null,
    hy2:   cfg.stack.hy2   ? { active: null, usersCount: (cfg.hy2Users || []).length }   : null,
    mieru: cfg.stack.mieru ? { active: null, usersCount: (cfg.mieruUsers || []).length } : null,
    vless: cfg.stack.vless ? { active: null, usersCount: (cfg.vlessUsers || []).length } : null,
  });
}

async function getServiceStatus(req, res) {
  const { kind } = req.params;
  const unit = kindToUnit(kind);
  if (!unit) return res.status(400).json({ error: 'bad kind' });

  const active = await serviceIsActive(unit);
  res.json({ active });
}

async function getTrafficHandler(req, res) {
  try {
    const data = await getTraffic();
    res.json(data);
  } catch (e) {
    res.json({ daily: null, connections: { naive: null, hy2: null, mieru: null, vless: null }, hourly: [], lastReset: null, error: e.message });
  }
}

async function serviceActionHandler(req, res) {
  const { kind, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'bad action' });
  const unit = kindToUnit(kind);
  if (!unit) return res.status(400).json({ error: 'bad kind' });

  const result = await serviceAction(action, unit);
  res.json({ success: result.success, active: result.active });
}

module.exports = { getConfig, getVersion, getStatus, getServiceStatus, getTraffic: getTrafficHandler, serviceAction: serviceActionHandler };
