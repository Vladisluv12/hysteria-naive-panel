'use strict';

const { execSyncSafe } = require('../services/systemAdapter.js');
const fs = require('fs');
const path = require('path');

const WARP_CONFIG_PATH = '/etc/wireguard/warp-config.json';
const WARP_IPDETECT_PATH = '/etc/wireguard/warp-ipdetect.txt';

const DEFAULT_CONFIG = {
  enabled: false,
  domains: [
    // IP detection services
    'icanhazip.com',
    'ipinfo.io',
    'ip-api.com',
    'checkip.amazonaws.com',
    'whatismyipaddress.com',
    // Google (except YouTube)
    'google.com',
    'googleapis.com',
    'gstatic.com',
    'googleusercontent.com',
    'ggpht.com',
    'googletagmanager.com',
    'googleadservices.com',
    'doubleclick.net',
    'withgoogle.com',
    'googlehosted.com',
    'appspot.com',
    'cloudfunctions.net',
    'run.app',
    'firebaseio.com',
    'firebaseapp.com',
    'web.app',
  ],
  cidrs: [
    '104.16.132.229',
    '104.16.133.229',
    '172.64.139.179',
    '172.64.140.34',
    '34.117.59.0/24',
    '108.61.164.0/24',
  ],
};

function loadConfig() {
  try {
    if (fs.existsSync(WARP_CONFIG_PATH)) {
      const data = fs.readFileSync(WARP_CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (_) {}
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  const dir = path.dirname(WARP_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(WARP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function writeIpDetectFile(config) {
  const lines = ['# IP detection services — traffic to these goes through WARP', '# Format: one CIDR or IP per line', ''];

  if (config.cidrs && config.cidrs.length > 0) {
    lines.push('# IP ranges');
    config.cidrs.forEach(cidr => lines.push(cidr));
    lines.push('');
  }

  if (config.domains && config.domains.length > 0) {
    lines.push('# Domains (resolved to IPs by the routing script)');
    config.domains.forEach(domain => lines.push(domain));
  }

  const dir = path.dirname(WARP_IPDETECT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(WARP_IPDETECT_PATH, lines.join('\n'));
}

function getWarpStatus(req, res) {
  try {
    const active = execSyncSafe('systemctl is-active warp');
    const enabled = execSyncSafe('systemctl is-enabled warp');

    let warpIp = '';
    try {
      const ipResult = execSyncSafe('curl -s --interface warp --max-time 5 https://ipinfo.io/ip');
      if (ipResult.success) warpIp = ipResult.output.trim();
    } catch (_) {}

    let realIp = '';
    try {
      const ipResult = execSyncSafe('curl -s --max-time 5 https://ipinfo.io/ip');
      if (ipResult.success) realIp = ipResult.output.trim();
    } catch (_) {}

    res.json({
      active: active.output === 'active',
      enabled: enabled.output === 'enabled',
      warpIp,
      realIp,
      interface: 'warp0',
    });
  } catch (e) {
    res.json({ active: false, enabled: false, warpIp: '', realIp: '', interface: 'warp0', error: e.message });
  }
}

function getWarpConfig(req, res) {
  const config = loadConfig();
  res.json(config);
}

function updateWarpConfig(req, res) {
  try {
    const { enabled, domains, cidrs } = req.body;

    const config = {
      enabled: enabled !== undefined ? enabled : false,
      domains: Array.isArray(domains) ? domains : [],
      cidrs: Array.isArray(cidrs) ? cidrs : [],
    };

    saveConfig(config);
    writeIpDetectFile(config);

    // If WARP is enabled, apply routing; if disabled, remove routing
    if (config.enabled) {
      // Restart WARP to apply new routing
      execSyncSafe('systemctl restart warp');
    } else {
      // Stop WARP and clean up routing
      execSyncSafe('systemctl stop warp');
    }

    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function startWarp(req, res) {
  const result = execSyncSafe('systemctl start warp');
  if (!result.success) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  res.json({ ok: true });
}

function stopWarp(req, res) {
  const result = execSyncSafe('systemctl stop warp');
  if (!result.success) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  res.json({ ok: true });
}

function restartWarp(req, res) {
  const result = execSyncSafe('systemctl restart warp');
  if (!result.success) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  res.json({ ok: true });
}

module.exports = { getWarpStatus, getWarpConfig, updateWarpConfig, startWarp, stopWarp, restartWarp };
