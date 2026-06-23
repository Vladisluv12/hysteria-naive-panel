'use strict';

const { execSyncSafe } = require('../services/systemAdapter.js');
const fs = require('fs');
const path = require('path');

const WARP_CONFIG_PATH = '/etc/wireguard/warp-config.json';
const WARP_CONF_PATH = '/etc/wireguard/warp.conf';

const DEFAULT_CONFIG = {
  enabled: false,
  domains: [
    'icanhazip.com', 'ipinfo.io', 'ip-api.com', 'checkip.amazonaws.com',
    'google.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com',
    'ggpht.com', 'googletagmanager.com', 'googleadservices.com',
    'cloudfunctions.net', 'firebaseio.com', 'firebaseapp.com', 'web.app',
  ],
  cidrs: [
    '104.16.132.229', '104.16.133.229', '172.64.139.179', '172.64.140.34',
    '34.117.59.0/24', '108.61.164.0/24',
  ],
};

function loadConfig() {
  try {
    if (fs.existsSync(WARP_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(WARP_CONFIG_PATH, 'utf8'));
    }
  } catch (_) {}
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  const dir = path.dirname(WARP_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WARP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function resolveDomainsToIPs(domains) {
  const ips = [];
  for (const domain of domains) {
    try {
      const result = execSyncSafe(`dig +short A ${domain} 2>/dev/null | grep -E '^[0-9]' | head -3`);
      if (result.success && result.output.trim()) {
        result.output.trim().split('\n').forEach(ip => ips.push(ip.trim()));
      }
    } catch (_) {}
  }
  return ips;
}

function rewriteWarpConf(allowedIPs) {
  if (!fs.existsSync(WARP_CONF_PATH)) return false;
  let conf = fs.readFileSync(WARP_CONF_PATH, 'utf8');
  const ipList = allowedIPs.join(', ');
  conf = conf.replace(/^AllowedIPs\s*=.*$/m, `AllowedIPs = ${ipList}`);
  fs.writeFileSync(WARP_CONF_PATH, conf);
  return true;
}

function getWarpStatus(req, res) {
  try {
    const active = execSyncSafe('systemctl is-active warp');
    let warpIp = '';
    try {
      const ipResult = execSyncSafe('curl -s --interface warp --max-time 5 https://cloudflare.com/cdn-cgi/trace');
      if (ipResult.success && ipResult.output.includes('warp=on')) {
        const ipLine = execSyncSafe('curl -s --interface warp --max-time 5 https://ipinfo.io/ip');
        if (ipLine.success) warpIp = ipLine.output.trim();
      }
    } catch (_) {}
    let realIp = '';
    try {
      const ipResult = execSyncSafe('curl -s --max-time 5 https://ipinfo.io/ip');
      if (ipResult.success) realIp = ipResult.output.trim();
    } catch (_) {}

    res.json({
      active: active.output === 'active',
      warpIp,
      realIp,
    });
  } catch (e) {
    res.json({ active: false, warpIp: '', realIp: '', error: e.message });
  }
}

function getWarpConfig(req, res) {
  res.json(loadConfig());
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

    // Resolve domains to IPs, combine with CIDRs for AllowedIPs
    const resolvedIPs = resolveDomainsToIPs(config.domains);
    const allIPs = [...config.cidrs, ...resolvedIPs];
    const uniqueIPs = [...new Set(allIPs.filter(ip => ip && ip.trim()))];

    if (uniqueIPs.length > 0) {
      rewriteWarpConf(uniqueIPs);
    }

    if (config.enabled) {
      execSyncSafe('systemctl restart warp');
    } else {
      execSyncSafe('systemctl stop warp');
    }

    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function startWarp(req, res) {
  const result = execSyncSafe('systemctl start warp');
  if (!result.success) return res.status(500).json({ ok: false, error: result.error });
  res.json({ ok: true });
}

function stopWarp(req, res) {
  const result = execSyncSafe('systemctl stop warp');
  if (!result.success) return res.status(500).json({ ok: false, error: result.error });
  res.json({ ok: true });
}

function restartWarp(req, res) {
  const result = execSyncSafe('systemctl restart warp');
  if (!result.success) return res.status(500).json({ ok: false, error: result.error });
  res.json({ ok: true });
}

module.exports = { getWarpStatus, getWarpConfig, updateWarpConfig, startWarp, stopWarp, restartWarp };
